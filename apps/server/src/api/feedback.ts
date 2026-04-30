import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { applyFeedback } from "../services/feedback.js";
import {
  maybeRefineProfile,
  wouldTriggerRefinement,
} from "../services/ai/refinement.js";

export const feedbackRouter: Router = Router();

feedbackRouter.use(requireUser);

const feedbackSchema = z.object({
  status: z.enum(["pending", "seen", "saved", "skipped", "rated", "plan_to"]),
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
    // Preserve the undefined-vs-null distinction so applyFeedback can decide
    // whether to leave the rating column alone (omitted) or clear it
    // (explicit null). The `?? null` collapse here was the bug behind
    // "save clears my rating" — saving a rated rec sent no rating in the
    // body, but ?? coerced it to null, clobbering the column.
    const feedbackInput: {
      status: typeof parsed.data.status;
      rating?: number | null;
    } = { status: parsed.data.status };
    if (parsed.data.rating !== undefined) {
      feedbackInput.rating = parsed.data.rating;
    }
    const row = await applyFeedback(userId, id, feedbackInput);
    if (!row) {
      res.status(404).json({ error: "recommendation not found" });
      return;
    }

    // Quick count check — synchronous, so we can tell the client whether
    // their feedback just kicked off a background refinement. The actual
    // refine call still runs fire-and-forget below; this just lets the UI
    // show a "your profile is evolving" banner immediately.
    const refinementTriggered = await wouldTriggerRefinement(userId);

    // Fire-and-forget. Errors get logged in the service; never block the user.
    void maybeRefineProfile(userId).catch((err) => {
      logger.error({ err }, "refinement background trigger failed");
    });

    res.json({
      id: row.id,
      status: row.status,
      rating: row.rating,
      actedAt: row.actedAt,
      refinementTriggered,
    });
  } catch (err) {
    next(err);
  }
});
