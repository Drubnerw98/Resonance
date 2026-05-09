import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { recommendationBatches, recommendations } from "../db/schema.js";
import {
  generateRecommendations,
  rescoreRecommendation,
} from "../services/ai/recommender.js";
import {
  findActiveJobForUser,
  getJob,
  startJob,
  type JobStatus,
} from "../services/jobs.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { enrichWithRuntime } from "../services/mediaCache.js";

const GENERATE_JOB_KIND = "recommendations.generate";

interface GenerateJobResult {
  count: number;
  batchId: string;
  recommendationIds: string[];
}

export const recommendationsRouter: Router = Router();

recommendationsRouter.use(requireUser);

const generateBodySchema = z
  .object({
    prompt: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * POST /api/recommendations/generate
 * Body: { prompt?: string }. Kicks off the 4-step recommendation pipeline as
 * a background job and returns immediately with a jobId. The pipeline
 * creates a recommendation_batches row (with the prompt if provided) and
 * recommendations link to it. Pollable via /generate/:jobId.
 */
recommendationsRouter.post("/generate", async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const parsed = generateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }
    const prompt = parsed.data.prompt;

    // If the user already has a job in flight, return it instead of starting
    // a duplicate. Prevents accidental double-clicks from queueing two runs.
    // Note: this returns BEFORE the rate-limit check so resuming a deduped
    // in-flight job doesn't double-count.
    const existing = await findActiveJobForUser(userId, GENERATE_JOB_KIND);
    if (existing) {
      res.status(202).json({ jobId: existing.id, status: existing.status });
      return;
    }

    try {
      checkRateLimit(userId, "recommendations.generate");
    } catch (err) {
      const status =
        err instanceof Error && "status" in err
          ? Number((err as { status?: number }).status) || 429
          : 429;
      res
        .status(status)
        .json({ error: err instanceof Error ? err.message : "rate limited" });
      return;
    }

    const job = await startJob<GenerateJobResult>({
      userId,
      kind: GENERATE_JOB_KIND,
      work: async () => {
        const result = await generateRecommendations(
          userId,
          prompt ? { prompt } : {},
        );
        return {
          count: result.recs.length,
          batchId: result.batch.id,
          recommendationIds: result.recs.map((r) => r.id),
        };
      },
    });

    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations/generate/:jobId
 * Returns the current status of a generate job. When status is "completed",
 * the response includes the new recommendations joined with media.
 */
recommendationsRouter.get("/generate/:jobId", async (req, res, next) => {
  try {
    const jobId = req.params.jobId!;
    const job = await getJob<GenerateJobResult>(jobId);
    if (!job || job.userId !== req.user!.id) {
      res.status(404).json({ error: "job not found" });
      return;
    }

    const body: {
      jobId: string;
      status: JobStatus;
      error?: string;
      count?: number;
      batchId?: string;
      recommendations?: unknown[];
    } = { jobId: job.id, status: job.status };

    if (job.status === "failed" && job.error) body.error = job.error;
    if (job.status === "completed" && job.result) {
      body.count = job.result.count;
      body.batchId = job.result.batchId;
      body.recommendations = await joinWithMedia(job.result.recommendationIds);
    }

    res.json(body);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations/active-job
 * Returns the user's currently-running generate job, if any. Used by the
 * frontend on mount to resume polling after a reload mid-generation.
 * Always 200; `jobId` is null when nothing is in flight.
 */
recommendationsRouter.get("/active-job", async (req, res, next) => {
  try {
    const job = await findActiveJobForUser(req.user!.id, GENERATE_JOB_KIND);
    if (!job) {
      res.json({ jobId: null });
      return;
    }
    res.json({ jobId: job.id, status: job.status });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations/batches
 * Returns the user's batch list (newest first), with each batch's rec count.
 * Lightweight — used to populate the "your lists" page.
 */
recommendationsRouter.get("/batches", async (req, res, next) => {
  try {
    const rows = await db.query.recommendationBatches.findMany({
      where: eq(recommendationBatches.userId, req.user!.id),
      orderBy: [desc(recommendationBatches.createdAt)],
      // Pull through the rec→media relation. Returns enough data per rec
      // so the lists page can:
      //   - count per-format ("3 movies · 2 games")
      //   - derive a smart batch label from the most-common taste tags
      //   - show 4 cover thumbnails (top by match score)
      with: {
        recommendations: {
          columns: { id: true, tasteTags: true, matchScore: true },
          with: {
            media: { columns: { mediaType: true, normalizedData: true } },
          },
        },
      },
    });
    res.json({
      batches: rows.map((b) => {
        const formatCounts: Record<string, number> = {};
        const tagCounts: Record<string, number> = {};
        for (const r of b.recommendations) {
          formatCounts[r.media.mediaType] =
            (formatCounts[r.media.mediaType] ?? 0) + 1;
          for (const t of r.tasteTags ?? []) {
            tagCounts[t] = (tagCounts[t] ?? 0) + 1;
          }
        }
        // Top 3 covers by match score — visual identity for the list.
        const sortedByScore = [...b.recommendations].sort(
          (a, b2) => b2.matchScore - a.matchScore,
        );
        const coverUrls: string[] = [];
        for (const r of sortedByScore) {
          const url = r.media.normalizedData?.imageUrl;
          if (typeof url === "string" && url.length > 0) {
            coverUrls.push(url);
            if (coverUrls.length >= 4) break;
          }
        }
        // Top 3 most-common taste tags — used for smart default label.
        const topTags = Object.entries(tagCounts)
          .sort(([, a], [, c]) => c - a)
          .slice(0, 3)
          .map(([t]) => t);
        return {
          id: b.id,
          prompt: b.prompt,
          name: b.name,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          count: b.recommendations.length,
          formatCounts,
          topTags,
          coverUrls,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

const renameBodySchema = z
  .object({ name: z.string().trim().max(120).nullable() })
  .strict();

/**
 * PATCH /api/recommendations/batches/:id
 * Rename a batch (set or clear its `name`). Body: { name: string | null }.
 */
recommendationsRouter.patch("/batches/:id", async (req, res, next) => {
  try {
    const id = req.params.id!;
    const parsed = renameBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }
    const [updated] = await db
      .update(recommendationBatches)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(eq(recommendationBatches.id, id))
      .returning();
    if (!updated || updated.userId !== req.user!.id) {
      res.status(404).json({ error: "batch not found" });
      return;
    }
    res.json({
      id: updated.id,
      prompt: updated.prompt,
      name: updated.name,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/recommendations/batches/:id
 * Deletes a single batch (and its recs, via FK cascade). Useful for letting
 * users prune lists they don't want to keep.
 */
recommendationsRouter.delete("/batches/:id", async (req, res, next) => {
  try {
    const id = req.params.id!;
    const [row] = await db
      .delete(recommendationBatches)
      .where(eq(recommendationBatches.id, id))
      .returning({
        id: recommendationBatches.id,
        userId: recommendationBatches.userId,
      });
    if (!row || row.userId !== req.user!.id) {
      res.status(404).json({ error: "batch not found" });
      return;
    }
    res.json({ deleted: row.id });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/recommendations
 * Wipes all recommendation rows for the current user (and their batches via
 * FK cascade — the relation cascades `recommendations` from `batches`, but
 * we delete `recommendations` directly to be explicit; batches stay).
 */
recommendationsRouter.delete("/", async (req, res, next) => {
  try {
    // Cascade: deleting batches drops their recs. Cleanest "clear my history".
    const result = await db
      .delete(recommendationBatches)
      .where(eq(recommendationBatches.userId, req.user!.id))
      .returning({ id: recommendationBatches.id });
    res.json({ deleted: result.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recommendations/:id/rescore
 * Re-runs the scoring AI call against the user's CURRENT taste profile for
 * a single existing recommendation. Useful after profile refinement when
 * the user wants to see how an old rec holds up against the evolved profile.
 * Updates matchScore / explanation / tasteTags in place; leaves
 * status / rating / actedAt untouched.
 */
recommendationsRouter.post("/:id/rescore", async (req, res, next) => {
  try {
    const id = req.params.id!;
    try {
      checkRateLimit(req.user!.id, "recommendations.rescore");
    } catch (err) {
      const status =
        err instanceof Error && "status" in err
          ? Number((err as { status?: number }).status) || 429
          : 429;
      res
        .status(status)
        .json({ error: err instanceof Error ? err.message : "rate limited" });
      return;
    }
    const updated = await rescoreRecommendation(req.user!.id, id);
    const [enriched] = await joinWithMedia([updated.id]);
    res.json({ recommendation: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations
 * Returns all recommendations for the user, newest first, with the joined
 * media_cache row + the parent batch (so the frontend can group by batch).
 *
 * Side effect: kicks off a background backfill for any TMDB movie/TV recs
 * whose `runtime` field is still null — these are typically older recs
 * persisted before the runtime field existed. Capped per-request so a
 * one-off page load can't fan out 200 TMDB calls. Fire-and-forget; the
 * data shows up on the user's next refresh.
 */
recommendationsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await db.query.recommendations.findMany({
      where: eq(recommendations.userId, req.user!.id),
      orderBy: [desc(recommendations.createdAt)],
      with: { media: true, batch: true },
    });
    res.json({ recommendations: rows.map(serializeRec) });

    const stale = rows
      .map((r) => r.media)
      .filter(
        (m) =>
          m.source === "tmdb" &&
          (m.mediaType === "movie" || m.mediaType === "tv") &&
          m.normalizedData.runtime == null,
      )
      .slice(0, 30);
    if (stale.length > 0) {
      enrichWithRuntime(stale).catch(() => {
        // Backfill is best-effort — failures are logged inside enrichWithRuntime.
      });
    }
  } catch (err) {
    next(err);
  }
});

async function joinWithMedia(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.query.recommendations.findMany({
    where: (r, { inArray }) => inArray(r.id, ids),
    orderBy: [desc(recommendations.createdAt)],
    with: { media: true, batch: true },
  });
  return rows.map(serializeRec);
}

function serializeRec(
  r: Awaited<
    ReturnType<
      typeof db.query.recommendations.findMany<{
        with: { media: true; batch: true };
      }>
    >
  >[number],
) {
  return {
    id: r.id,
    batchId: r.batchId,
    batch: {
      id: r.batch.id,
      prompt: r.batch.prompt,
      name: r.batch.name,
      createdAt: r.batch.createdAt,
    },
    matchScore: r.matchScore,
    explanation: r.explanation,
    tasteTags: r.tasteTags,
    crossReferences: r.crossReferences ?? [],
    status: r.status,
    rating: r.rating,
    createdAt: r.createdAt,
    actedAt: r.actedAt,
    media: {
      cacheId: r.media.id,
      ...r.media.normalizedData,
    },
  };
}
