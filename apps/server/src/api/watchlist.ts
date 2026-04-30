import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { decideWatchlist } from "../services/ai/decide.js";
import { checkRateLimit } from "../services/rateLimit.js";

export const watchlistRouter: Router = Router();

watchlistRouter.use(requireUser);

const decideBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(500),
  })
  .strict();

/**
 * POST /api/watchlist/decide
 * Body: { prompt }
 * Ranks the user's watchlist by mood fit and returns the top picks. Pure
 * rank-from-set — does not generate new candidates. Watchlist source is
 * library_items where status='watchlist' (Plan-to from rec cards + imported
 * to-read / plan-to-watch from Goodreads / MAL).
 */
watchlistRouter.post("/decide", async (req, res, next) => {
  try {
    const parsed = decideBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }

    try {
      checkRateLimit(req.user!.id, "watchlist.decide");
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

    const picks = await decideWatchlist(req.user!.id, parsed.data.prompt);
    res.json({
      picks: picks.map((p) => ({
        libraryItemId: p.item.id,
        title: p.item.title,
        mediaType: p.item.mediaType,
        year: p.item.year,
        source: p.item.source,
        rank: p.rank,
        explanation: p.explanation,
      })),
    });
  } catch (err) {
    next(err);
  }
});
