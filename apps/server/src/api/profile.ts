import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  onboardingSessions,
  recommendations,
  tasteProfiles,
  users,
} from "../db/schema.js";
import { getActiveProfile, saveProfile } from "../services/profile.js";
import { listLibraryItems } from "../services/library.js";
import { refineProfile } from "../services/ai/refinement.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { TasteProfileSchema } from "../services/ai/schemas.js";

export const profileRouter: Router = Router();

profileRouter.use(requireUser);

profileRouter.get("/", async (req, res, next) => {
  try {
    const row = await getActiveProfile(req.user!.id);
    if (!row) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }
    res.json({
      id: row.id,
      version: row.currentVersion,
      data: row.profileData,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/export
 *
 * Aggregated, read-only snapshot for downstream visualization tools
 * (Constellation). Returns the user's TasteProfile plus their library and
 * recommendations in a flat shape — no per-batch nesting, since the
 * consumer just needs titles + tags + status. Recommendations are deduped
 * by media id (newest wins) so a user with multiple feedback loops on the
 * same title doesn't render as duplicate stars.
 */
profileRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const profileRow = await getActiveProfile(userId);
    if (!profileRow) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }

    // Only ship manually-added library items to Constellation. Bulk
    // imports from Letterboxd / Goodreads / MAL / Steam can run into the
    // thousands per user and represent consumption history, not the
    // curated taste signal the constellation visualizes.
    const libraryRows = (await listLibraryItems(userId)).filter(
      (row) => row.source === "manual",
    );
    const recRows = await db.query.recommendations.findMany({
      where: eq(recommendations.userId, userId),
      orderBy: [desc(recommendations.createdAt)],
      with: { media: true },
    });

    const seen = new Set<string>();
    const dedupedRecs: typeof recRows = [];
    for (const r of recRows) {
      if (seen.has(r.mediaCacheId)) continue;
      seen.add(r.mediaCacheId);
      dedupedRecs.push(r);
    }

    res.json({
      profile: profileRow.profileData,
      library: libraryRows.map((row) => ({
        id: row.id,
        title: row.title,
        mediaType: row.mediaType,
        year: row.year,
        rating: row.rating,
        source: "library" as const,
      })),
      recommendations: dedupedRecs.map((r) => ({
        id: r.id,
        title: r.media.title,
        mediaType: r.media.mediaType,
        year: r.media.normalizedData.year,
        matchScore: r.matchScore,
        tasteTags: r.tasteTags,
        status: r.status,
        rating: r.rating,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/profile
 * Manual edit. Body: full TasteProfile JSON. Validated via the same zod
 * schema the AI extraction path uses, then persisted with
 * trigger="manual_edit" so it shows up correctly in profile_versions
 * history. saveProfile already invalidates cached discovery themes, so the
 * next /explore visit regenerates against the edited profile.
 */
profileRouter.put("/", async (req, res, next) => {
  try {
    const parsed = TasteProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid profile", issues: parsed.error.issues });
      return;
    }

    const existing = await getActiveProfile(req.user!.id);
    if (!existing) {
      res
        .status(404)
        .json({ error: "no profile to edit — run onboarding first" });
      return;
    }

    const row = await saveProfile(req.user!.id, parsed.data, "manual_edit");
    res.json({
      id: row.id,
      version: row.currentVersion,
      data: row.profileData,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile/reset
 * "Start over from scratch" — wipes the user's taste profile and onboarding
 * sessions, flips onboarding_status back to "pending". Library items and
 * recommendations are NOT touched (those are separate features the user
 * might want to keep). After reset the user is back to the pre-onboarding
 * state and can run a fresh chat → new profile.
 */
profileRouter.post("/reset", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    // Cascading deletes: taste_profiles → profile_versions, both via FK.
    await db.delete(tasteProfiles).where(eq(tasteProfiles.userId, userId));
    await db
      .delete(onboardingSessions)
      .where(eq(onboardingSessions.userId, userId));
    await db
      .update(users)
      .set({ onboardingStatus: "pending", updatedAt: new Date() })
      .where(eq(users.id, userId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile/refine
 * Manually trigger profile refinement against accumulated feedback. Sync —
 * the response waits for the model and returns the new profile (versioned
 * in profile_versions with trigger="feedback_batch").
 */
profileRouter.post("/refine", async (req, res, next) => {
  try {
    try {
      checkRateLimit(req.user!.id, "profile.refine");
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
    const refined = await refineProfile(req.user!.id);
    const row = await getActiveProfile(req.user!.id);
    if (!row) throw new Error("Profile vanished after refinement");
    res.json({
      id: row.id,
      version: row.currentVersion,
      data: refined,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});
