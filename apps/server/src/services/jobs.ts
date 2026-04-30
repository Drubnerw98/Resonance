import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs as jobsTable, type JobRow } from "../db/schema.js";
import { logger } from "../lib/logger.js";

/**
 * Postgres-backed job tracker. Replaces the in-memory Map that used to live
 * here so a deploy or process crash mid-batch no longer orphans the user's
 * generation; the row stays around and the boot-time recovery sweep
 * (`recoverOrphanedJobs`) flips any leftover "running" jobs to "failed" so
 * the client gets a real status instead of a 404.
 *
 * Public API matches the old shape — `startJob` / `getJob` /
 * `findActiveJobForUser` — but every call is now async because each one is
 * a SQL round-trip. Call sites add `await` and `async` on the route handler.
 *
 * Currently single-instance: `startJob` inserts with `status='running'`
 * directly and the worker function runs in the same Node process. To go
 * multi-instance, the only architectural change is the worker's pickup —
 * it would need an atomic claim (`UPDATE ... SET status='running' WHERE id
 * = $1 AND status = 'pending' RETURNING *`) and the route handler would
 * insert with `status='pending'` and let any replica claim. We don't run
 * replicas yet, so this stays simple.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job<TResult = unknown> {
  id: string;
  userId: string;
  kind: string;
  status: JobStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: TResult;
}

// Completed/failed rows live for a week so the user (and our debugging) can
// inspect recent history. After that, periodic delete prunes them.
const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Worker writes a heartbeat at this cadence so a stale-process check can
// distinguish "still running" from "process died mid-job". Picked to be
// well under the typical generation duration (60-120s) without spamming
// the DB.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// A "running" job whose heartbeat is older than this is treated as dead —
// the worker that started it has crashed or hung. 5 min is well above our
// p99 generation time but tight enough that the client doesn't poll a
// dead job forever.
const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

function rowToJob<TResult = unknown>(row: JobRow): Job<TResult> {
  const job: Job<TResult> = {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    startedAt: row.startedAt,
  };
  if (row.completedAt) job.completedAt = row.completedAt;
  if (row.error) job.error = row.error;
  if (row.result !== null && row.result !== undefined) {
    job.result = row.result as TResult;
  }
  return job;
}

/**
 * Start a new job. Inserts the row synchronously (so the caller can hand
 * back the id immediately), then spawns a background worker that runs the
 * supplied work function and patches the row on completion.
 */
export async function startJob<TResult>(opts: {
  userId: string;
  kind: string;
  work: () => Promise<TResult>;
}): Promise<Job<TResult>> {
  const now = new Date();
  const [inserted] = await db
    .insert(jobsTable)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      status: "running",
      startedAt: now,
      heartbeatAt: now,
    })
    .returning();
  if (!inserted) throw new Error("failed to insert job row");

  const job = rowToJob<TResult>(inserted);

  void runWorker(job.id, opts.work);

  return job;
}

/**
 * Background worker — runs the user-supplied function, beats every 30s
 * while running, and patches the row to completed/failed on finish. Errors
 * inside `work` are captured and stored on the row so the client can see
 * a useful message instead of a generic 500.
 */
async function runWorker<TResult>(
  jobId: string,
  work: () => Promise<TResult>,
): Promise<void> {
  // Heartbeat on a setInterval. .unref() so this timer alone doesn't keep
  // the process alive at shutdown — in practice the work itself does.
  const heartbeat = setInterval(() => {
    void db
      .update(jobsTable)
      .set({ heartbeatAt: new Date() })
      .where(eq(jobsTable.id, jobId))
      .catch((err: unknown) => {
        logger.warn({ err, jobId }, "job: heartbeat update failed");
      });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  try {
    const result = await work();
    await db
      .update(jobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        result: result as JobRow["result"],
      })
      .where(eq(jobsTable.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error({ err, jobId }, "job: failed");
    await db
      .update(jobsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: message,
      })
      .where(eq(jobsTable.id, jobId))
      .catch((updateErr: unknown) => {
        // We can't surface the failure if the failure write itself fails —
        // log it and let the stale-heartbeat sweep catch it eventually.
        logger.error(
          { err: updateErr, jobId },
          "job: could not write failure status",
        );
      });
  } finally {
    clearInterval(heartbeat);
  }
}

/** Lookup. Caller is responsible for the userId-equality check. */
export async function getJob<TResult = unknown>(
  id: string,
): Promise<Job<TResult> | undefined> {
  const row = await db.query.jobs.findFirst({
    where: eq(jobsTable.id, id),
  });
  return row ? rowToJob<TResult>(row) : undefined;
}

/**
 * Most recently started running job for the user, or undefined. Used so the
 * frontend can resume polling after a page reload mid-generation. Filters
 * out rows whose heartbeat is stale — the worker is dead, the row will be
 * swept by the stale-heartbeat check, but we don't want the client to
 * adopt it as "active" in the meantime.
 */
export async function findActiveJobForUser(
  userId: string,
  kind: string,
): Promise<Job | undefined> {
  const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS);
  const row = await db.query.jobs.findFirst({
    where: and(
      eq(jobsTable.userId, userId),
      eq(jobsTable.kind, kind),
      eq(jobsTable.status, "running"),
    ),
    orderBy: [desc(jobsTable.startedAt)],
  });
  if (!row) return undefined;
  if (row.heartbeatAt && row.heartbeatAt < cutoff) return undefined;
  return rowToJob(row);
}

/**
 * Boot-time recovery. Called once from `index.ts` before the server starts
 * accepting traffic. Any job left in `status='running'` is the result of
 * a process that died mid-work — the worker isn't coming back, so flip
 * those rows to `failed` with a clear error message. The client polling
 * such a job sees the failure on its next tick.
 *
 * Single-instance assumption: this is safe because no other process is
 * legitimately running these jobs. In a multi-instance world we'd have
 * to use the heartbeat instead (only flip rows whose heartbeat predates
 * THIS process's startup time).
 */
export async function recoverOrphanedJobs(): Promise<number> {
  const result = await db
    .update(jobsTable)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: "process restarted during job",
    })
    .where(eq(jobsTable.status, "running"))
    .returning({ id: jobsTable.id });
  if (result.length > 0) {
    logger.warn(
      { count: result.length },
      "job: recovered orphaned running jobs at startup",
    );
  }
  return result.length;
}

/**
 * Periodic prune of completed/failed rows older than `JOB_TTL_MS`. Called
 * from a hourly setInterval registered at module load. Keeps the table
 * from growing without bound while leaving recent history available for
 * debugging.
 */
async function pruneOldJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - JOB_TTL_MS);
  await db
    .delete(jobsTable)
    .where(
      and(
        or(eq(jobsTable.status, "completed"), eq(jobsTable.status, "failed")),
        lt(jobsTable.completedAt, cutoff),
      ),
    );
}

setInterval(
  () => {
    void pruneOldJobs().catch((err: unknown) => {
      logger.warn({ err }, "job: prune failed");
    });
  },
  60 * 60 * 1000,
).unref();
