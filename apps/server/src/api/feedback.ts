import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { applyFeedback } from "../services/feedback.js";
import { maybeRefineProfile } from "../services/ai/refinement.js";

export const feedbackRouter: Router = Router();

feedbackRouter.use(requireUser);

const feedbackSchema = z.object({
  status: z.enum(["pending", "seen", "saved", "skipped", "rated"]),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

/**
 * PATCH /api/recommendations/:id/feedback
 * Updates the status (and optional 1-5 rating) for a single recommendation.
 * Returns the updated row.
 *
 * Side effect: fires a fire-and-forget profile refinement check. If enough
 * feedback has accumulated since the last refinement, the user's TasteProfile
 * gets re-extracted in the background. The HTTP response doesn't wait for it.
 */
feedbackRouter.patch("/:id/feedback", async (req, res, next) => {
  try {
    const id = req.params.id!;
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }

    const userId = req.user!.id;
    const row = await applyFeedback(userId, id, {
      status: parsed.data.status,
      rating: parsed.data.rating ?? null,
    });
    if (!row) {
      res.status(404).json({ error: "recommendation not found" });
      return;
    }

    // Fire-and-forget. Errors get logged in the service; never block the user.
    void maybeRefineProfile(userId).catch((err) => {
      console.error("[refinement] background trigger failed:", err);
    });

    res.json({
      id: row.id,
      status: row.status,
      rating: row.rating,
      actedAt: row.actedAt,
    });
  } catch (err) {
    next(err);
  }
});
