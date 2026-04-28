import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { recommendations } from "../db/schema.js";
import { generateRecommendations } from "../services/ai/recommender.js";

export const recommendationsRouter: Router = Router();

recommendationsRouter.use(requireUser);

/**
 * POST /api/recommendations/generate
 * Triggers the 4-step recommendation pipeline. Synchronous — the client
 * waits until persistence finishes (typically 10-30s for the two AI calls
 * plus N media-API searches). Returns the saved batch.
 */
recommendationsRouter.post("/generate", async (req, res, next) => {
  try {
    const created = await generateRecommendations(req.user!.id);
    res.json({
      count: created.length,
      batchId: created[0]?.batchId ?? null,
      recommendations: await joinWithMedia(created.map((r) => r.id)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/recommendations
 * Wipes all recommendation rows for the current user. Dev convenience for
 * starting a clean slate after prompt/pipeline changes invalidate older
 * batches. Doesn't touch media_cache or the user's profile.
 */
recommendationsRouter.delete("/", async (req, res, next) => {
  try {
    const result = await db
      .delete(recommendations)
      .where(eq(recommendations.userId, req.user!.id))
      .returning({ id: recommendations.id });
    res.json({ deleted: result.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations
 * Returns all recommendations for the user, newest first, with the joined
 * media_cache row (so the frontend can render image/title/year/etc without
 * a second fetch).
 */
recommendationsRouter.get("/", async (req, res, next) => {
  try {
    const ids = (
      await db.query.recommendations.findMany({
        where: eq(recommendations.userId, req.user!.id),
        orderBy: [desc(recommendations.createdAt)],
        columns: { id: true },
      })
    ).map((r) => r.id);

    res.json({ recommendations: await joinWithMedia(ids) });
  } catch (err) {
    next(err);
  }
});

async function joinWithMedia(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.query.recommendations.findMany({
    where: (r, { inArray }) => inArray(r.id, ids),
    orderBy: [desc(recommendations.createdAt)],
    with: { media: true },
  });
  return rows.map((r) => ({
    id: r.id,
    batchId: r.batchId,
    matchScore: r.matchScore,
    explanation: r.explanation,
    tasteTags: r.tasteTags,
    status: r.status,
    rating: r.rating,
    createdAt: r.createdAt,
    actedAt: r.actedAt,
    media: {
      cacheId: r.media.id,
      ...r.media.normalizedData,
    },
  }));
}
