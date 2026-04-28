import { randomUUID } from "node:crypto";

/**
 * In-memory job tracker for long-running operations the frontend polls.
 *
 * Scope: single Node process, lost on restart. That's fine for our local
 * dev setup and even single-instance deploys. If we ever go multi-instance
 * we'd swap this for a DB table or Redis — the public API of the module
 * stays the same.
 *
 * Job rows expire `JOB_TTL_MS` after completion to prevent the Map from
 * growing without bound.
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

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour after completion

const jobs = new Map<string, Job<unknown>>();

/** Periodically prune completed/failed jobs. */
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (
      job.completedAt &&
      now - job.completedAt.getTime() > JOB_TTL_MS
    ) {
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000).unref(); // .unref so this timer doesn't keep the process alive

/**
 * Start a new job. The work runs immediately in the background; this call
 * returns a Job<TResult> object you can hand back to the client.
 */
export function startJob<TResult>(opts: {
  userId: string;
  kind: string;
  work: () => Promise<TResult>;
}): Job<TResult> {
  const job: Job<TResult> = {
    id: randomUUID(),
    userId: opts.userId,
    kind: opts.kind,
    status: "running",
    startedAt: new Date(),
  };
  jobs.set(job.id, job as Job<unknown>);

  void (async () => {
    try {
      const result = await opts.work();
      job.status = "completed";
      job.result = result;
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "unknown error";
      console.error(`[job ${job.id}] (${job.kind}) failed:`, err);
    } finally {
      job.completedAt = new Date();
    }
  })();

  return job;
}

/** Lookup. Caller is responsible for the userId-equality check. */
export function getJob<TResult = unknown>(
  id: string,
): Job<TResult> | undefined {
  return jobs.get(id) as Job<TResult> | undefined;
}

/** Most recently started running job for the user, or undefined. Used so the
 * frontend can resume polling after a page reload mid-generation. */
export function findActiveJobForUser(
  userId: string,
  kind: string,
): Job | undefined {
  let latest: Job | undefined;
  for (const job of jobs.values()) {
    if (job.userId !== userId || job.kind !== kind) continue;
    if (job.status !== "running") continue;
    if (!latest || job.startedAt > latest.startedAt) latest = job;
  }
  return latest;
}
