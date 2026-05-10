import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  MediaSearchQuery,
  MediaType,
  TasteProfile,
} from "@resonance/shared";
import { db } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import {
  libraryItems,
  recommendationBatches,
  recommendations,
  type DroppedCandidate,
  type MediaCacheRow,
  type NewRecommendationRow,
  type RecommendationBatchRow,
  type RecommendationRow,
} from "../../db/schema.js";
import {
  enrichWithRuntime,
  searchAndCacheByQuery,
  searchAndCacheByTitle,
} from "../mediaCache.js";
import { getActiveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { recommendCandidatesSystemPrompt } from "./prompts/recommendCandidates.js";
import { recommendScoreSystemPrompt } from "./prompts/recommendScore.js";
import { formatLibraryBlock } from "./aiHelpers.js";
import { aiTimeoutSignal, withAiTimeout } from "./aiTimeout.js";
import {
  canonicalizeTitle,
  collectAvoidTitles,
  matchesKnown,
} from "./titleMatching.js";
import {
  CandidatesOutputSchema,
  ScoredCandidatesOutputSchema,
  type CandidatesOutput,
  type ScoredCandidatesOutput,
} from "./schemas.js";

const RECOMMENDER_MODEL = ONBOARDING_MODEL; // claude-sonnet-4-6
const MAX_CANDIDATES_TO_SCORE = 60;
// Per-format cap so a single chatty adapter (Open Library especially —
// genre searches there return 30+ marginal hits per query) can't drown
// out the others when we cap the total candidate pool.
const MAX_CANDIDATES_PER_FORMAT = 12;

function collectFavorites(profile: TasteProfile): Set<string> {
  return new Set(
    profile.mediaAffinities.flatMap((a) => a.favorites).map(canonicalizeTitle),
  );
}

/** A user's "library" — works they've signaled positive on, either by
 * mentioning in onboarding (their profile favorites) or by saving/rating
 * highly on a recommendation. Fed into the scoring prompt so explanations
 * can reference specific works by name ("because you mentioned Mad Men,
 * ..."). The cross-reference is the single biggest differentiator from a
 * one-off chat. */
export interface LibraryItem {
  title: string;
  mediaType: MediaType;
  source: "profile" | "saved" | "rated" | "imported";
  rating: number | null;
}

/**
 * Build the user's library from three sources, deduped by canonical title:
 *   - recommendations with status=saved or rated 4-5 (strongest signal)
 *   - imported library_items (from Letterboxd CSV / manual adds)
 *   - profile.mediaAffinities[].favorites — titles they named in onboarding
 *
 * Bias toward feedback first (strongest), then imports, then profile mentions.
 * Same-title duplicates collapse to whichever source we encountered first.
 */
export async function getUserLibrary(
  userId: string,
  profile: TasteProfile,
): Promise<LibraryItem[]> {
  const fromFeedback: LibraryItem[] = (
    await db.query.recommendations.findMany({
      where: and(
        eq(recommendations.userId, userId),
        or(
          eq(recommendations.status, "saved"),
          and(
            eq(recommendations.status, "rated"),
            gt(recommendations.rating, 3),
          ),
        ),
      ),
      with: { media: true },
      orderBy: [desc(recommendations.actedAt)],
      limit: 25,
    })
  ).map((r) => ({
    title: r.media.title,
    mediaType: r.media.mediaType,
    source: r.status === "saved" ? ("saved" as const) : ("rated" as const),
    rating: r.rating,
  }));

  // Imported library items, EXCLUDING anything the user rated 1-2 AND
  // EXCLUDING watchlist entries (the user hasn't actually engaged with
  // those yet — using them as cross-references would be misleading). Both
  // get their own treatment elsewhere: low-rated → avoid set; watchlist →
  // dedup pool.
  const fromImported: LibraryItem[] = (
    await db.query.libraryItems.findMany({
      where: and(
        eq(libraryItems.userId, userId),
        eq(libraryItems.status, "consumed"),
        // Only items with no rating OR rating >= 3 count as positive library.
        or(isNull(libraryItems.rating), gt(libraryItems.rating, 2)),
      ),
      orderBy: [desc(libraryItems.createdAt)],
      limit: 200,
    })
  ).map((row) => ({
    title: row.title,
    mediaType: row.mediaType,
    source: "imported" as const,
    rating: row.rating,
  }));

  const fromProfile: LibraryItem[] = profile.mediaAffinities.flatMap((aff) =>
    aff.favorites.map((title) => ({
      title,
      mediaType: aff.format,
      source: "profile" as const,
      rating: null,
    })),
  );

  // Dedupe by canonical title — feedback > imported > profile.
  const seen = new Set<string>();
  const merged: LibraryItem[] = [];
  for (const item of [...fromFeedback, ...fromImported, ...fromProfile]) {
    const key = canonicalizeTitle(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export interface GenerateOptions {
  /** Free-text prompt scoping this batch ("a movie that'll make me cry"). */
  prompt?: string;
}

export interface GenerateResult {
  batch: RecommendationBatchRow;
  recs: RecommendationRow[];
}

/**
 * Mode 3 orchestrator: 4-step recommendation pipeline.
 *
 *   1. Create a recommendation_batches row (with optional user prompt).
 *   2. Ask the model for title suggestions + discovery queries, scoped to
 *      the prompt and grounded in the user's library.
 *   3. For each, search the relevant adapter and persist hits to media_cache.
 *      Drop anything we've already recommended, profile-favorite-matching, or
 *      avoid-list-matching.
 *   4. Send the surviving candidates back to the model with the user's
 *      library so explanations can cross-reference saved items.
 *   5. Persist a recommendations row per scored result, all linked to the
 *      batch.
 */
export async function generateRecommendations(
  userId: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    // 400 (user state), not 500 (server fault). Frontend gates the UI to an
    // EmptyState when profile is missing; the status code keeps the API honest
    // for any callers that bypass the UI gate.
    const err: Error & { status?: number } = new Error(
      "Cannot generate recommendations: user has no taste profile yet",
    );
    err.status = 400;
    throw err;
  }
  const profile = profileRow.profileData;
  const prompt = options.prompt?.trim() || null;

  // Drop accumulator threaded through the pipeline. We persist whatever's
  // accumulated at every checkpoint where the pipeline can fail — the user
  // gets best-effort visibility even if scoring crashes mid-batch.
  const dropped: DroppedCandidate[] = [];

  // Create the batch row first so all rec inserts can reference it.
  const [batch] = await db
    .insert(recommendationBatches)
    .values({ userId, prompt, name: null })
    .returning();
  if (!batch) throw new Error("Failed to create recommendation batch");
  logger.info({ batchId: batch.id, prompt }, "rec: batch created");

  // Pull existing recs once and derive two caches: the set of media_cache
  // UUIDs already recommended (exact-row dedup), AND the set of canonical
  // titles already recommended (cross-batch series-variant dedup). Without
  // the second set, "Vinland Saga" in batch 1 doesn't prevent "Vinland Saga
  // Season 2" from showing up in batch 2 — different cache rows, different
  // UUIDs, but the same work-cluster from the user's perspective.
  const existingRecs = await db.query.recommendations.findMany({
    where: eq(recommendations.userId, userId),
    with: { media: { columns: { id: true, title: true } } },
  });
  const seenCacheIds = new Set(existingRecs.map((r) => r.mediaCacheId));
  const previouslyRecommendedTitles = new Set(
    existingRecs.map((r) => canonicalizeTitle(r.media.title)),
  );

  // Watchlist items go into the same "already on the user's radar" set so
  // they aren't re-surfaced as new recommendations. Different from the avoid
  // set: the user might still want recs in the same vein, just not THIS
  // specific work. Adding to seenCanonicals (via previouslyRecommendedTitles)
  // is the right semantic — same as already-recommended.
  const watchlistRows = await db.query.libraryItems.findMany({
    where: and(
      eq(libraryItems.userId, userId),
      eq(libraryItems.status, "watchlist"),
    ),
    columns: { title: true },
  });
  for (const row of watchlistRows) {
    previouslyRecommendedTitles.add(canonicalizeTitle(row.title));
  }

  const library = await getUserLibrary(userId, profile);
  const librarySources = library.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] ?? 0) + 1;
    return acc;
  }, {});
  logger.info(
    { count: library.length, sources: librarySources },
    "rec: library will inform scoring",
  );

  // Step 1 — AI proposes candidates (prompt + library aware).
  const plan = await generateCandidatePlan(profile, prompt, library);
  const formatsInPlan = countByFormat(
    plan.titleSuggestions.map((s) => s.mediaType),
  );
  logger.info(
    {
      titles: plan.titleSuggestions.length,
      queries: plan.discoveryQueries.length,
      byFormat: formatsInPlan,
    },
    "rec: plan generated",
  );

  // Step 2 — validate against real APIs, deduping and excluding seen items
  // (already-recommended cache rows + profile favorites + avoid-list).
  const favorites = collectFavorites(profile);
  const avoidTitles = await collectAvoidTitles(userId, profile);
  logger.debug(
    { count: favorites.size, sample: Array.from(favorites).slice(0, 12) },
    "rec: favorites set",
  );
  logger.debug(
    { count: avoidTitles.size, sample: Array.from(avoidTitles).slice(0, 12) },
    "rec: avoid set",
  );
  // Enabled formats = those the user has in their TasteProfile's
  // mediaAffinities array. Removing a format from the profile editor is
  // the user's "disable this medium" toggle.
  const enabledFormats = new Set<MediaType>(
    profile.mediaAffinities.map((a) => a.format),
  );
  logger.debug({ formats: Array.from(enabledFormats) }, "rec: enabled formats");

  const candidates = await collectRealCandidates(
    plan,
    seenCacheIds,
    favorites,
    avoidTitles,
    previouslyRecommendedTitles,
    enabledFormats,
    dropped,
  );
  logger.info(
    {
      count: candidates.length,
      byFormat: countByFormat(candidates.map((c) => c.mediaType)),
      dropped: dropped.length,
    },
    "rec: validated cache rows after dedupe + seen-filter",
  );
  if (candidates.length === 0) {
    // Persist drops even on the no-candidates failure path — the user
    // benefits from seeing WHY nothing landed (e.g. all dropped as
    // disliked-title or format-disabled).
    await persistDroppedCandidates(batch.id, dropped);
    const err: Error & { status: number } = Object.assign(
      new Error(
        "Recommendation pipeline produced 0 valid candidates — try widening the profile or onboarding more.",
      ),
      { status: 422 },
    );
    throw err;
  }

  // Step 3 — AI scores real candidates with library context.
  const scored = await scoreCandidates(profile, candidates, {
    prompt,
    library,
  });
  logger.info(
    { count: scored.recommendations.length },
    "rec: scored recommendations returned by model",
  );

  // Step 4 — persist scored recs against the batch.
  // The model receives all candidates but typically returns a subset (Rule 1
  // says "drop misfits over hitting volume"). The candidates the model
  // didn't include are scored-and-dropped — record them now.
  const scoredCandidateIds = new Set(
    scored.recommendations.map((r) => r.candidateId),
  );
  candidates.forEach((c, i) => {
    const idx = String(i + 1);
    if (!scoredCandidateIds.has(idx)) {
      dropped.push({
        title: c.normalizedData.title,
        mediaType: c.mediaType,
        reason: "scored-and-dropped",
        detail: "the model judged this a poor fit after seeing the full set",
      });
    }
  });
  const saved = await persistRecommendations(
    userId,
    batch.id,
    candidates,
    scored,
  );
  logger.info(
    {
      count: saved.length,
      batchId: batch.id,
      byFormat: countByFormat(
        saved.map(
          (r) =>
            candidates.find((c) => c.id === r.mediaCacheId)?.mediaType ??
            "unknown",
        ),
      ),
    },
    "rec: persisted",
  );

  // Step 5 — enrich the persisted picks with runtime (TMDB movies/TV only).
  // After scoring so we only spend the extra detail-fetch on items that
  // actually became recs. Failures are non-fatal — runtime stays null on
  // the row and the client treats null as "—" in the sort.
  const winnerCacheIds = new Set(saved.map((r) => r.mediaCacheId));
  const winners = candidates.filter((c) => winnerCacheIds.has(c.id));
  await enrichWithRuntime(winners);

  // Persist drops on the batch row. Best-effort: a failure here doesn't
  // unwind the recs we already persisted — we log and move on.
  await persistDroppedCandidates(batch.id, dropped);

  return { batch, recs: saved };
}

/**
 * Write the accumulated drops to the batch row's dropped_candidates JSONB.
 * Called at every successful pipeline checkpoint so even partial failures
 * preserve whatever drops were captured. Idempotent — overwrites the
 * column with the latest snapshot rather than appending.
 */
async function persistDroppedCandidates(
  batchId: string,
  dropped: DroppedCandidate[],
): Promise<void> {
  if (dropped.length === 0) return;
  try {
    await db
      .update(recommendationBatches)
      .set({ droppedCandidates: dropped, updatedAt: new Date() })
      .where(eq(recommendationBatches.id, batchId));
  } catch (err) {
    logger.warn(
      { batchId, err, droppedCount: dropped.length },
      "rec: failed to persist dropped candidates",
    );
  }
}

function countByFormat(formats: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of formats) {
    counts[f] = (counts[f] ?? 0) + 1;
  }
  return counts;
}

/** Map common phrasings to a dominant media type. Returns null when the
 * prompt doesn't pin a single format. Used by the candidate + scoring
 * prompts to override format-breadth requirements when the user is being
 * explicit ("a movie that'll make me cry" should bias hard to movies). */
function detectExplicitFormat(prompt: string | null): MediaType | null {
  if (!prompt) return null;
  const p = prompt.toLowerCase();
  // Order matters when a phrase contains a substring of another.
  const checks: { mediaType: MediaType; patterns: RegExp[] }[] = [
    {
      mediaType: "manga",
      patterns: [/\bmanga(s)?\b/, /\blight novel(s)?\b/],
    },
    {
      mediaType: "anime",
      patterns: [/\banime(s)?\b/],
    },
    {
      mediaType: "tv",
      patterns: [/\btv\b/, /\bshow(s)?\b/, /\bseries\b/, /\bseason(s)?\b/],
    },
    {
      mediaType: "movie",
      patterns: [/\bmovie(s)?\b/, /\bfilm(s)?\b/, /\bcinema\b/],
    },
    {
      mediaType: "game",
      patterns: [/\bgame(s)?\b/, /\bvideo\s+game(s)?\b/],
    },
    {
      mediaType: "book",
      patterns: [/\bbook(s)?\b/, /\bnovel(s)?\b/, /\bread(s)?\b/],
    },
  ];
  // First match wins; "tv" / "show" before "movie" so "tv show" doesn't
  // false-match "movie" via the "show" check (it doesn't, but order is
  // belt and suspenders).
  for (const c of checks) {
    if (c.patterns.some((re) => re.test(p))) return c.mediaType;
  }
  return null;
}

async function generateCandidatePlan(
  profile: TasteProfile,
  prompt: string | null,
  library: LibraryItem[],
): Promise<CandidatesOutput> {
  const client = getAnthropic();

  const sections: string[] = [
    `# Taste profile\n\n${JSON.stringify(profile, null, 2)}`,
  ];

  // Explicit list of formats the user has DISABLED — every format not in
  // their mediaAffinities. Belt-and-suspenders alongside the prompt rule
  // ("don't propose titles in formats with comfort < 0.2"). If a format
  // doesn't appear in mediaAffinities at all, it's been actively disabled
  // and proposing for it is wrong.
  const ALL_FORMATS: MediaType[] = [
    "movie",
    "tv",
    "anime",
    "manga",
    "game",
    "book",
  ];
  const enabledFormats = new Set(profile.mediaAffinities.map((a) => a.format));
  const disabledFormats = ALL_FORMATS.filter((f) => !enabledFormats.has(f));
  if (disabledFormats.length > 0) {
    sections.push(
      `# Disabled formats (NEVER propose any of these — the user has explicitly turned them off)\n\n${disabledFormats.join(", ")}`,
    );
  }

  if (library.length > 0) {
    sections.push(
      `# User's library (works they've already loved — do NOT re-propose, but use as anchors)\n\n${formatLibraryBlock(library)}`,
    );
  }

  if (prompt) {
    const explicitFormat = detectExplicitFormat(prompt);
    let promptSection = `# This batch's prompt\n\n"${prompt}"\n\nThe user wants recommendations specifically aligned with this prompt. Their broader taste profile still applies as a guardrail (don't violate avoidances), but tilt your suggestions toward what the prompt asks for.`;
    if (explicitFormat) {
      promptSection += `\n\n**The prompt asks specifically for ${explicitFormat}.** Treat this as a single-format request: at LEAST 80% of titleSuggestions must be ${explicitFormat}. The cross-format breadth rule is OVERRIDDEN by an explicit format request — the user is telling you what they want; respect it. A single complementary suggestion in a different format is fine, but don't fan out across all formats.`;
    }
    sections.push(promptSection);
  }

  sections.push(`# Task\n\nGenerate candidate recommendations.`);

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: RECOMMENDER_MODEL,
      max_tokens: 2048,
      system: recommendCandidatesSystemPrompt(),
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: {
        format: zodOutputFormat(
          CandidatesOutputSchema as unknown as Parameters<
            typeof zodOutputFormat
          >[0],
        ),
      },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(
      `Candidate generation failed (stop_reason=${response.stop_reason})`,
    );
  }
  return CandidatesOutputSchema.parse(response.parsed_output);
}

// Exported for direct unit testing — the filtering rules here (favorites
// dropped, avoid set dropped, prior-batch series-variants deduped, disabled
// formats hard-filtered, per-format cap) are the most regression-prone
// piece of the pipeline.
//
// `dropped` is an OUT-parameter accumulator. We pass a single mutable
// array through the pipeline rather than capturing in a closure or a
// service-level pool — explicit, easy to test (assert array contents),
// and avoids hidden state. Drops we record here:
//   - hallucinated     (model proposed a title; adapter found nothing)
//   - format-disabled  (mediaType not in user's enabled set)
//   - duplicate        (already in a prior batch / profile favorite / dup)
//   - disliked-title   (matches the user's avoid set — rec/library/profile)
// Scored-and-dropped (model accepted to scoring stage but rejected) is
// captured later in `persistRecommendations`.
// The first reason wins per canonical title — the order of checks in
// consider() is the precedence we want for the user-facing label.
export async function collectRealCandidates(
  plan: CandidatesOutput,
  seenCacheIds: Set<string>,
  favorites: Set<string>,
  avoidTitles: Set<string>,
  previouslyRecommendedTitles: Set<string>,
  enabledFormats: Set<MediaType>,
  dropped: DroppedCandidate[] = [],
): Promise<MediaCacheRow[]> {
  const byCacheId = new Map<string, MediaCacheRow>();
  // Canonical titles we've already accepted — both within this batch AND
  // across all prior batches. Seed with prior-rec canonicals so series
  // variants like "Vinland Saga Season 2" get deduped against an earlier
  // batch's "Vinland Saga".
  const seenCanonicals = new Set<string>(previouslyRecommendedTitles);
  let droppedAsFavorite = 0;
  let droppedAsSeen = 0;
  let droppedAsAvoided = 0;
  let droppedAsDup = 0;
  let droppedAsDisabledFormat = 0;

  // Track which canonical titles we've already recorded a drop for in this
  // call, so a model that double-proposes (title search + discovery query)
  // doesn't surface the same dropped title twice. Reasoned at canonical
  // level to collapse "X" and "X Season 2".
  const droppedCanonicals = new Set<string>();
  function record(
    title: string,
    mediaType: MediaType,
    reason: DroppedCandidate["reason"],
    detail?: string,
  ): void {
    const canon = canonicalizeTitle(title);
    if (droppedCanonicals.has(canon)) return;
    droppedCanonicals.add(canon);
    dropped.push(
      detail ? { title, mediaType, reason, detail } : { title, mediaType, reason },
    );
  }

  function consider(r: MediaCacheRow): void {
    // Hard-filter by enabled formats. The candidate prompt also instructs
    // the model to skip disabled formats, but server-side enforcement is
    // the safety net — even if the model proposes a movie when the user
    // has movies disabled, it never reaches the scoring step.
    if (!enabledFormats.has(r.mediaType)) {
      droppedAsDisabledFormat++;
      record(
        r.normalizedData.title,
        r.mediaType,
        "format-disabled",
        `${r.mediaType} is turned off in your profile`,
      );
      return;
    }
    if (seenCacheIds.has(r.id)) {
      droppedAsSeen++;
      record(
        r.normalizedData.title,
        r.mediaType,
        "duplicate",
        "already in a previous batch",
      );
      return;
    }
    if (matchesKnown(r.normalizedData.title, favorites)) {
      droppedAsFavorite++;
      record(
        r.normalizedData.title,
        r.mediaType,
        "duplicate",
        "you already love this — it's a profile favorite",
      );
      return;
    }
    if (matchesKnown(r.normalizedData.title, avoidTitles)) {
      droppedAsAvoided++;
      // The avoid set is title-level only (rec/library dislikes + profile
      // dislikedTitles). Abstract avoidance patterns ("torture porn") are
      // enforced upstream at the candidate-prompt stage by the model itself,
      // so anything that gets THIS far must have matched a specific title.
      record(r.normalizedData.title, r.mediaType, "disliked-title");
      return;
    }
    if (matchesKnown(r.normalizedData.title, seenCanonicals)) {
      droppedAsDup++;
      record(
        r.normalizedData.title,
        r.mediaType,
        "duplicate",
        "matches a title you already had",
      );
      return;
    }
    seenCanonicals.add(canonicalizeTitle(r.normalizedData.title));
    if (!byCacheId.has(r.id)) byCacheId.set(r.id, r);
  }

  // Per-format raw-hit counts (before any of our filtering kicks in) so we
  // can pinpoint where a format's candidates disappear. If "raw" has games
  // but "validated" doesn't, the loss is in our dedup/favorites filter; if
  // "raw" has zero games, the IGDB call failed or returned nothing.
  const rawByFormat: Record<string, number> = {};

  // Fan out title searches AND discovery queries in parallel. Each adapter
  // has its own token bucket, so concurrent calls to the same adapter
  // serialize naturally; concurrent calls to *different* adapters run truly
  // in parallel. Promise.allSettled keeps a single failed search from
  // killing the whole batch — failures get logged and the survivor results
  // proceed. Insertion order into byCacheId / seenCanonicals matters for
  // the per-format cap (earlier hits win slots), so we apply title-search
  // results before discovery-query results.
  const titleSettlements = await Promise.allSettled(
    plan.titleSuggestions.map(async (sug) => ({
      sug,
      hits: await searchAndCacheByTitle(sug.mediaType, sug.title),
    })),
  );
  for (let i = 0; i < titleSettlements.length; i++) {
    const settlement = titleSettlements[i]!;
    const sug = plan.titleSuggestions[i]!;
    if (settlement.status === "rejected") {
      logger.warn(
        {
          title: sug.title,
          mediaType: sug.mediaType,
          err: settlement.reason,
        },
        "rec: title search failed",
      );
      continue;
    }
    const { hits } = settlement.value;
    rawByFormat[sug.mediaType] =
      (rawByFormat[sug.mediaType] ?? 0) + hits.length;
    if (hits.length === 0) {
      logger.warn(
        { title: sug.title, mediaType: sug.mediaType },
        "rec: title search returned 0 hits",
      );
      // The model invented (or misremembered) this title — no media_cache
      // row corresponds to it. This is the anti-hallucination guarantee
      // surfaced to the user. We record at the canonical level inside
      // record() so a same-title repeat in discoveryQueries doesn't
      // double-log.
      record(
        sug.title,
        sug.mediaType,
        "hallucinated",
        "no matching real title found in our metadata sources",
      );
    }
    for (const r of hits) consider(r);
  }

  // Discovery queries — genre-based only. Keywords were dropped from the
  // schema because abstract theme strings don't match how these APIs do
  // free-text search.
  const discoverySettlements = await Promise.allSettled(
    plan.discoveryQueries.map(async (q) => {
      const query: MediaSearchQuery = {
        mediaType: q.mediaType,
        genres: q.genres,
        limit: 8,
      };
      return { q, hits: await searchAndCacheByQuery(query) };
    }),
  );
  for (let i = 0; i < discoverySettlements.length; i++) {
    const settlement = discoverySettlements[i]!;
    const q = plan.discoveryQueries[i]!;
    if (settlement.status === "rejected") {
      logger.warn(
        { mediaType: q.mediaType, err: settlement.reason },
        "rec: discovery query failed",
      );
      continue;
    }
    const { hits } = settlement.value;
    rawByFormat[q.mediaType] = (rawByFormat[q.mediaType] ?? 0) + hits.length;
    if (hits.length === 0) {
      logger.warn(
        { mediaType: q.mediaType, genres: q.genres },
        "rec: discovery query returned 0 hits",
      );
    }
    for (const r of hits) consider(r);
  }

  logger.info({ byFormat: rawByFormat }, "rec: raw hits before filtering");
  logger.info(
    {
      droppedAsDisabledFormat,
      droppedAsSeen,
      droppedAsFavorite,
      droppedAsAvoided,
      droppedAsDup,
    },
    "rec: filtered",
  );

  // Cap per format first (so books don't drown out games/anime), then cap the
  // total. Iteration order is insertion order — earlier hits (title searches
  // first, then discovery queries) win the per-format slots.
  const perFormat = new Map<string, MediaCacheRow[]>();
  for (const r of byCacheId.values()) {
    const list = perFormat.get(r.mediaType) ?? [];
    if (list.length < MAX_CANDIDATES_PER_FORMAT) {
      list.push(r);
      perFormat.set(r.mediaType, list);
    }
  }
  const capped: MediaCacheRow[] = [];
  for (const list of perFormat.values()) capped.push(...list);

  return capped.slice(0, MAX_CANDIDATES_TO_SCORE);
}

export interface ScoreOptions {
  prompt?: string | null;
  library?: LibraryItem[];
}

export async function scoreCandidates(
  profile: TasteProfile,
  candidates: MediaCacheRow[],
  options: ScoreOptions = {},
): Promise<ScoredCandidatesOutput> {
  const client = getAnthropic();
  const library = options.library ?? [];
  const prompt = options.prompt ?? null;

  // Sequential ID per candidate so the model doesn't have to parrot UUIDs.
  // We map back to media_cache.id when persisting.
  const candidateBlock = candidates
    .map((c, i) => {
      const item = c.normalizedData;
      return `[${i + 1}] ${item.title} (${item.mediaType}, ${item.year ?? "?"}, rating=${item.rating ?? "?"})
genres: ${item.genres.slice(0, 6).join(", ") || "—"}
synopsis: ${truncate(item.description, 600)}`;
    })
    .join("\n\n");

  const requiredFloor = Math.min(20, candidates.length);

  const sections: string[] = [
    `# User profile\n\n${JSON.stringify(profile, null, 2)}`,
  ];

  if (library.length > 0) {
    sections.push(
      `# User's library (works they personally loved — REFERENCE these by name in explanations whenever a candidate's themes overlap)\n\n${formatLibraryBlock(library)}`,
    );
  }

  if (prompt) {
    const explicitFormat = detectExplicitFormat(prompt);
    let promptSection = `# This batch's prompt\n\n"${prompt}"\n\nThe user wants recs specifically aligned with this prompt. Reflect it in your explanations — name the connection between each rec and what they asked for.`;
    if (explicitFormat) {
      promptSection += `\n\n**The prompt asks specifically for ${explicitFormat}.** Your output must be at least 80% ${explicitFormat}. The format-breadth rule is overridden by an explicit format request. Drop non-${explicitFormat} candidates rather than padding to satisfy breadth.`;
    }
    sections.push(promptSection);
  }

  sections.push(
    `# Candidates (use the bracketed number as candidateId)\n\n${candidateBlock}`,
  );

  sections.push(
    `# Task\n\nYou have ${candidates.length} candidates. Target AT LEAST ${requiredFloor} recommendations — but Rule 1 (drop misfits) always wins over the volume target. Returning fewer than ${requiredFloor} because the rest are genuine misfits is the right answer; padding with poor fits is wrong.`,
  );

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: RECOMMENDER_MODEL,
      // 8192 because each scored rec carries explanation + tasteTags + 0-3
      // crossReferences ({title, reason}). At 25+ recs that's well over
      // 4096; mid-string truncation surfaces as a JSON parse error from the
      // SDK. Sonnet 4.6 caps far higher; 8192 is comfortable headroom
      // without paying for unused output budget.
      max_tokens: 8192,
      system: recommendScoreSystemPrompt(),
      messages: [{ role: "user", content: sections.join("\n\n") }],
      output_config: {
        format: zodOutputFormat(
          ScoredCandidatesOutputSchema as unknown as Parameters<
            typeof zodOutputFormat
          >[0],
        ),
      },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(`Scoring failed (stop_reason=${response.stop_reason})`);
  }
  return ScoredCandidatesOutputSchema.parse(response.parsed_output);
}

async function persistRecommendations(
  userId: string,
  batchId: string,
  candidates: MediaCacheRow[],
  scored: ScoredCandidatesOutput,
): Promise<RecommendationRow[]> {
  // candidateId is "1"-based against the candidates array.
  const cacheIdByIndex = new Map<string, string>();
  candidates.forEach((c, i) => cacheIdByIndex.set(String(i + 1), c.id));

  const rows: NewRecommendationRow[] = [];
  for (const r of scored.recommendations) {
    const mediaCacheId = cacheIdByIndex.get(r.candidateId);
    if (!mediaCacheId) {
      logger.warn(
        { candidateId: r.candidateId },
        "rec: model returned unknown candidateId",
      );
      continue;
    }
    rows.push({
      userId,
      batchId,
      mediaCacheId,
      matchScore: r.matchScore,
      explanation: r.explanation,
      tasteTags: r.tasteTags,
      // Drop the field entirely when empty so the column stays NULL on
      // older recs (rather than `[]`) — keeps the "model didn't propose
      // any" case distinguishable from "model proposed nothing relevant".
      crossReferences:
        r.crossReferences && r.crossReferences.length > 0
          ? r.crossReferences
          : null,
      status: "pending",
    });
  }

  if (rows.length === 0) return [];

  const inserted = await db
    .insert(recommendations)
    .values(rows)
    // The unique on (user_id, media_cache_id) makes this safe to retry.
    .onConflictDoNothing({
      target: [recommendations.userId, recommendations.mediaCacheId],
    })
    .returning();

  return inserted;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Re-score a single recommendation against the user's CURRENT profile.
 * Updates the row's matchScore / explanation / tasteTags in place; leaves
 * status / rating / actedAt untouched so user feedback survives.
 *
 * Used after profile refinement when the user wants to see how a specific
 * old rec holds up against the evolved taste DNA. Cheap — one AI call,
 * one candidate, ~3-5 seconds.
 */
export async function rescoreRecommendation(
  userId: string,
  recommendationId: string,
): Promise<RecommendationRow> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    throw new Error("Cannot rescore: user has no taste profile");
  }

  const rec = await db.query.recommendations.findFirst({
    where: and(
      eq(recommendations.id, recommendationId),
      eq(recommendations.userId, userId),
    ),
    with: { media: true },
  });
  if (!rec) {
    throw new Error("Recommendation not found");
  }

  const scored = await scoreCandidates(profileRow.profileData, [rec.media]);
  const newScore = scored.recommendations[0];
  if (!newScore) {
    // Model dropped this candidate — typically means it now violates the
    // refined profile's avoidances or fits poorly. Encode that as a low
    // score with an honest explanation rather than refusing the request.
    const [updated] = await db
      .update(recommendations)
      .set({
        matchScore: 0.3,
        explanation:
          "Your taste profile has evolved and this no longer reads as a strong fit.",
        tasteTags: [],
      })
      .where(
        and(
          eq(recommendations.id, recommendationId),
          eq(recommendations.userId, userId),
        ),
      )
      .returning();
    if (!updated) throw new Error("Failed to update recommendation");
    return updated;
  }

  const [updated] = await db
    .update(recommendations)
    .set({
      matchScore: newScore.matchScore,
      explanation: newScore.explanation,
      tasteTags: newScore.tasteTags,
    })
    .where(
      and(
        eq(recommendations.id, recommendationId),
        eq(recommendations.userId, userId),
      ),
    )
    .returning();
  if (!updated) throw new Error("Failed to update recommendation");
  return updated;
}
