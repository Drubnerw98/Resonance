import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import {
  generateThemes,
  getOrGenerateThemes,
} from "../services/ai/discover.js";
import { checkRateLimit } from "../services/rateLimit.js";

export const discoverRouter: Router = Router();

discoverRouter.use(requireUser);

/**
 * GET /api/discover/themes
 * Returns cached themes; generates synchronously on first call. Theme
 * generation is one model call, ~3-5s — acceptable to block on, and means
 * the client doesn't need a polling state machine for it.
 */
discoverRouter.get("/themes", async (req, res, next) => {
  try {
    const row = await getOrGenerateThemes(req.user!.id);
    res.json({
      themes: row.themes,
      generatedAt: row.generatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/discover/themes/refresh
 * Force-regenerate. Used when the user clicks the refresh button.
 */
discoverRouter.post("/themes/refresh", async (req, res, next) => {
  try {
    try {
      checkRateLimit(req.user!.id, "discover.refresh");
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
    const row = await generateThemes(req.user!.id);
    res.json({
      themes: row.themes,
      generatedAt: row.generatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
