import { Router } from "express";
import { and, desc, eq, ne, sql } from "drizzle-orm";
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
    const profile = profileRow.profileData;

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

    // Derive favorites: flatten mediaAffinities[].favorites and tag each
    // by which themes/archetypes mention them. Mirrors Constellation's
    // graph.ts:titleAppearsIn so the consumer doesn't have to redo the
    // work — direct substring first, then a 2+ content-token overlap
    // fallback that catches long-titled books ("First Law Trilogy") cited
    // by their familiar form ("First Law"). Untagged favorites still ship
    // (consumer drops them via the unanchored-node filter).
    const favorites = profile.mediaAffinities.flatMap((affinity) =>
      affinity.favorites.map((title) => ({
        title,
        mediaType: affinity.format,
        themes: profile.themes
          .filter((t) => titleAppearsIn(title, t.evidence))
          .map((t) => t.label),
        archetypes: profile.archetypes
          .filter((a) => titleAppearsIn(title, a.attraction))
          .map((a) => a.label),
      })),
    );

    // Avoidances ship with `kind` so the consumer can render abstract
    // patterns and named titles differently if it wants ("anti-stars" vs
    // "constellation negative space"). dislikedTitles is optional on the
    // profile shape (predates the field); ?? [] guards.
    const avoidances = [
      ...profile.avoidances.map((description) => ({
        description,
        kind: "pattern" as const,
      })),
      ...(profile.dislikedTitles ?? []).map((description) => ({
        description,
        kind: "title" as const,
      })),
    ];

    res.json({
      profile,
      library: libraryRows.map((row) => ({
        id: row.id,
        title: row.title,
        mediaType: row.mediaType,
        year: row.year,
        rating: row.rating,
        // Synthetic constant — the row's source is "manual" but the
        // export label has been "library" since the endpoint shipped.
        // Constellation's type pins it; don't break the contract.
        source: "library" as const,
        status: row.status,
        // Null + empty for watchlist entries and any pre-backfill manual
        // rows. Consumer treats nullish fitNote as "no rationale yet" and
        // falls back to title-substring positioning when tasteTags is empty.
        fitNote: row.fitNote,
        tasteTags: row.tasteTags,
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
        // The AI's per-item verdict (~1-2 sentences, item-specific). Distinct
        // from profile-level theme.evidence which describes the user's overall
        // pattern citing many other titles.
        explanation: r.explanation,
      })),
      favorites,
      avoidances,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Title-vs-text fuzzy match. Mirrors Constellation's `titleAppearsIn`:
 * direct normalized substring, with a 2+ content-token overlap fallback
 * for long titles cited by their short form ("First Law Trilogy ..."
 * matches evidence saying "First Law"). The 2-token threshold prevents
 * common words like "the" or "story" from triggering false positives.
 */
function titleAppearsIn(title: string, text: string): boolean {
  const titleNorm = normalize(title);
  const textNorm = normalize(text);
  if (titleNorm.length === 0) return false;
  if (textNorm.includes(titleNorm)) return true;

  const titleTokens = contentTokens(titleNorm);
  if (titleTokens.length < 2) return false;
  const textTokens = new Set(contentTokens(textNorm));
  let overlap = 0;
  for (const t of titleTokens) {
    if (textTokens.has(t)) overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "as", "is", "in", "on", "to",
  "for", "with", "without", "into", "through", "from", "by", "at",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "their", "its", "his", "her", "they", "them", "this", "that", "these",
  "those", "it", "we", "you", "he", "she",
  "who", "whom", "what", "which", "where", "when", "why", "how",
  "own", "not", "no", "yes",
]);

function contentTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

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
