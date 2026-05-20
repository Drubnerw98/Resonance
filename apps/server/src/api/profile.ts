import { Router } from "express";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { requireUser } from "../middleware/auth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { db } from "../db/index.js";
import {
  onboardingSessions,
  profileVersions,
  recommendations,
  tasteProfiles,
  users,
} from "../db/schema.js";
import { getActiveProfile, saveProfile } from "../services/profile.js";
import { refineProfile } from "../services/ai/refinement.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { TasteProfileSchema } from "../services/ai/schemas.js";
import { buildProfileExport } from "../services/profileExport.js";

export const profileRouter: Router = Router();

profileRouter.use(requireUser);
profileRouter.param("versionId", validateUuidParam);

profileRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const row = await getActiveProfile(userId);
    if (!row) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }
    // Count of recs the user has actually engaged with — feeds the
    // "profile maturity" indicator on the client (whether to show the
    // "still forming · feedback sharpens it" nudge). `pending` means the
    // user hasn't seen/acted on it; everything else counts.
    const [countRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(recommendations)
      .where(
        and(
          eq(recommendations.userId, userId),
          ne(recommendations.status, "pending"),
        ),
      );
    const actedRecCount = countRow?.value ?? 0;
    res.json({
      id: row.id,
      version: row.currentVersion,
      data: row.profileData,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      actedRecCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/versions
 * Returns the user's full profile history (oldest → newest), each entry
 * carrying the full TasteProfile snapshot at that point + the trigger
 * (onboarding / feedback_batch / manual_edit) and creation timestamp.
 *
 * The client computes structural diffs between adjacent versions for the
 * "evolution timeline" UI on /profile — surfacing the persistent-profile
 * differentiator that's otherwise invisible in the live UI.
 */
profileRouter.get("/versions", async (req, res, next) => {
  try {
    const profileRow = await getActiveProfile(req.user!.id);
    if (!profileRow) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }

    const rows = await db.query.profileVersions.findMany({
      where: eq(profileVersions.profileId, profileRow.id),
      // Oldest first — the timeline reads chronologically, and computing
      // diffs between v[n-1] and v[n] is simpler when we iterate forward.
      orderBy: [asc(profileVersions.versionNumber)],
    });

    res.json({
      versions: rows.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        trigger: v.trigger as "onboarding" | "feedback_batch" | "manual_edit",
        profile: v.profileData,
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/export
 *
 * Aggregated, read-only snapshot for downstream visualization tools
 * (Constellation). Returns the user's TasteProfile plus library, recs,
 * derived favorites, and structured avoidances. Recommendations are
 * deduped by media id (newest wins) so a user with multiple feedback
 * loops on the same title doesn't render as duplicate stars.
 *
 * Library items carry per-item AI annotation (fit_note + taste_tags) for
 * manual+consumed rows; watchlist items ship with null/empty annotation
 * so the consumer's substring fallback can still position them.
 *
 * `favorites` are derived from profile.mediaAffinities[].favorites: the
 * AI extracts these during onboarding ("what shows have you loved?")
 * and they live as flat title strings inside the profile JSONB. Surfacing
 * them as first-class export entries is the cheapest density win for
 * the constellation — no AI cost, pure structural derivation.
 */
profileRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const profileRow = await getActiveProfile(userId);
    if (!profileRow) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }
    const payload = await buildProfileExport(userId, profileRow.profileData);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/versions/:versionId/export
 *
 * Same shape as /api/profile/export, but built against a historical
 * profile_versions snapshot instead of the live profile. Library items and
 * recommendations are CURRENT (not versioned) — the diff Constellation cares
 * about between two version exports is profile-only (themes / archetypes /
 * favorites / avoidances), and library/rec rows have no version snapshots.
 *
 * Defense-in-depth: we filter the profile_versions row by the requesting
 * user's profile_id explicitly, even though Clerk middleware already gates
 * the route. A profile_versions row references a tasteProfiles row which
 * is uniquely owned by a user.
 */
profileRouter.get("/versions/:versionId/export", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const versionId = req.params.versionId!;

    const profileRow = await getActiveProfile(userId);
    if (!profileRow) {
      res.status(404).json({ error: "no profile yet" });
      return;
    }

    const versionRow = await db.query.profileVersions.findFirst({
      where: and(
        eq(profileVersions.id, versionId),
        // Belt-and-suspenders user scoping: only versions whose parent
        // profile belongs to this user are reachable. Two filters here —
        // (id, profileId) — are unambiguous because profileId pins the
        // owner via the active-profile row already loaded.
        eq(profileVersions.profileId, profileRow.id),
      ),
    });
    if (!versionRow) {
      res.status(404).json({ error: "version not found" });
      return;
    }

    const payload = await buildProfileExport(userId, versionRow.profileData);
    res.json(payload);
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
