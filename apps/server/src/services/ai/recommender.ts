import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  MediaSearchQuery,
  MediaType,
  TasteProfile,
} from "@resonance/shared";
import { db } from "../../db/index.js";
import {
  libraryItems,
  recommendationBatches,
  recommendations,
  type MediaCacheRow,
  type NewRecommendationRow,
  type RecommendationBatchRow,
  type RecommendationRow,
} from "../../db/schema.js";
import {
  searchAndCacheByQuery,
  searchAndCacheByTitle,
} from "../mediaCache.js";
import { getActiveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { recommendCandidatesSystemPrompt } from "./prompts/recommendCandidates.js";
import { recommendScoreSystemPrompt } from "./prompts/recommendScore.js";
import { formatLibraryBlock } from "./aiHelpers.js";
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

/**
 * Lowercase, strip "The " prefix, strip common edition/cut/remaster suffixes.
 * Two titles that canonicalize to the same string are treated as the same
 * work — collapses "Planescape: Torment" / "Planescape: Torment Enhanced
 * Edition" / "Final Fantasy VII Remastered" / "The Last of Us" / etc.
 */
export function canonicalizeTitle(s: string): string {
  let t = s.toLowerCase().trim();

  // Strip library-cataloging suffixes like "Republic, The" / "Nausea, LA"
  // (where the article or series tag is moved to the end). Apply BEFORE the
  // leading "the " strip so both forms collapse to the same canonical.
  t = t.replace(/,\s*(?:the|a|an|le|la|les|der|die|das)\s*$/i, "");
  t = t.replace(/^the\s+/, "");

  const suffixes: RegExp[] = [
    // "Enhanced Edition", "Premium Edition", "Director's Cut", "Final Cut",
    // "GOTY Edition", "Collector's Edition", etc.
    /\s*[-–—:]?\s*(?:the\s+)?(?:enhanced|definitive|ultimate|complete|gold|special|deluxe|director'?s|final|extended|game of the year|goty|anniversary|premium|collector'?s|standard)\s+(?:edition|cut|version)\s*$/i,
    // "Digital Deluxe" / bare "Deluxe" without "Edition" — common on game
    // store listings (e.g., Planescape Torment ... - Digital Deluxe).
    /\s*[-–—:]?\s*(?:digital\s+)?deluxe\s*$/i,
    /\s*[-–—:]?\s*(?:hd\s+)?remastered\s*$/i,
    /\s*[-–—:]?\s*(?:hd\s+)?remake\s*$/i,
    /\s+\(\d{4}\)\s*$/, // "Title (2017)" disambiguators
  ];
  // Multiple passes to handle stacked suffixes like "Enhanced Edition - Digital Deluxe":
  // first pass strips "- Digital Deluxe", second strips ": Enhanced Edition".
  for (let pass = 0; pass < 3; pass++) {
    const before = t;
    for (const re of suffixes) t = t.replace(re, "");
    if (t === before) break;
  }
  return t.trim();
}

/**
 * True if `candidate` matches anything in `known` either by exact canonical
 * match OR by being a `<Known>: <Subtitle>` / `<Known> & <Other>` /
 * `<Known> + <DLC>` / `<Known>, <Subtitle>` variant. Catches:
 *   - DLC names like "Pathologic 2: Marble Nest" → "Pathologic 2"
 *   - Compilation titles like "Planescape: Torment & Icewind Dale" → "Planescape: Torment"
 *   - Bundle titles like "Pathologic 2 + Marble Nest DLC bundle" → "Pathologic 2"
 * The required punctuation separator prevents false matches like "Severance"
 * vs "Severance Pay".
 */
/** Normalize internal punctuation for loose-equality comparison. Collapses
 * "Planescape Torment" and "Planescape: Torment" to the same shape after
 * suffixes are stripped — they're the same work formatted differently. */
function looseShape(s: string): string {
  return s.replace(/[:\-_]/g, " ").replace(/\s+/g, " ").trim();
}

// Two separator regexes for the prefix-match check:
//   - sepPunct accepts a punctuation separator (": ", " - ", " & ", etc.).
//     Safe for short prefixes; how subtitles are typically delineated.
//   - sepWhitespace accepts a plain space separator. Catches subtitle
//     patterns like "I am a hero in Osaka" against "I am a hero" — these
//     don't use punctuation. Only applied when the prefix is reasonably
//     long, to keep "Halo" / "Halo Wars" or "X" / "X Men" type cases from
//     falsely merging.
const sepPunct = /^\s*[:\-–—&+,]\s/;
const sepWhitespace = /^\s+\S/;
const SPACE_SEPARATOR_MIN_LENGTH = 8;

function matchesKnown(candidate: string, known: Set<string>): boolean {
  const nc = canonicalizeTitle(candidate);
  if (known.has(nc)) return true;

  // Loose-equality: two canonicals that differ only in internal punctuation
  // are the same work. Catches "Planescape Torment" / "Planescape: Torment".
  const ncLoose = looseShape(nc);
  for (const k of known) {
    if (looseShape(k) === ncLoose) return true;
  }

  for (const k of known) {
    // Candidate is the longer variant: "Foo: Bar" matches known "Foo".
    if (k.length >= 5 && nc.length > k.length && nc.startsWith(k)) {
      const tail = nc.slice(k.length);
      if (sepPunct.test(tail)) return true;
      if (k.length >= SPACE_SEPARATOR_MIN_LENGTH && sepWhitespace.test(tail))
        return true;
    }
    // Candidate is the shorter base title: "Foo" matches known "Foo: Bar".
    if (nc.length >= 5 && k.length > nc.length && k.startsWith(nc)) {
      const tail = k.slice(nc.length);
      if (sepPunct.test(tail)) return true;
      if (nc.length >= SPACE_SEPARATOR_MIN_LENGTH && sepWhitespace.test(tail))
        return true;
    }
  }
  return false;
}

function collectFavorites(profile: TasteProfile): Set<string> {
  return new Set(
    profile.mediaAffinities
      .flatMap((a) => a.favorites)
      .map(canonicalizeTitle),
  );
}

/**
 * Titles the user has actively rejected — pulled from three sources:
 *   - rec feedback (explicitly skipped, or rated 1-2 stars),
 *   - library imports rated 1-2 stars,
 *   - profile.dislikedTitles (specific titles named negatively during
 *     onboarding or earlier refinement passes).
 * Used to filter sequels and series variants of disliked works out of every
 * subsequent batch. Saved and 4-5 rated titles are NOT included: positive
 * signal shouldn't block related variants.
 */
export async function collectAvoidTitles(
  userId: string,
  profile: TasteProfile,
): Promise<Set<string>> {
  // From rec feedback: explicitly skipped, or rated 1-2 stars.
  const fromRecs = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      or(
        eq(recommendations.status, "skipped"),
        and(
          eq(recommendations.status, "rated"),
          lt(recommendations.rating, 3),
        ),
      ),
    ),
    with: { media: true },
  });
  // From library imports: any item rated 1-2 stars is treated as
  // user-flagged "I watched this and didn't like it".
  const fromLibrary = await db.query.libraryItems.findMany({
    where: and(
      eq(libraryItems.userId, userId),
      lt(libraryItems.rating, 3),
    ),
  });
  const set = new Set<string>();
  for (const r of fromRecs) set.add(canonicalizeTitle(r.media.title));
  for (const l of fromLibrary) set.add(canonicalizeTitle(l.title));
  // Profile-level disliked titles: titles the user named negatively during
  // onboarding (e.g. "I really didn't like The Name of the Wind"). The
  // extraction prompt collects these; refinement preserves and extends.
  for (const t of profile.dislikedTitles ?? []) set.add(canonicalizeTitle(t));
  return set;
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

  // Imported library items, EXCLUDING anything the user rated 1-2.
  // Low-rated imports flow into the avoid set instead — we don't want the
  // recommender to cross-reference something the user told us they hated.
  const fromImported: LibraryItem[] = (
    await db.query.libraryItems.findMany({
      where: and(
        eq(libraryItems.userId, userId),
        // Only items with no rating OR rating >= 3 count as positive library.
        or(
          isNull(libraryItems.rating),
          gt(libraryItems.rating, 2),
        ),
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
    throw new Error(
      "Cannot generate recommendations: user has no taste profile yet",
    );
  }
  const profile = profileRow.profileData;
  const prompt = options.prompt?.trim() || null;

  // Create the batch row first so all rec inserts can reference it.
  const [batch] = await db
    .insert(recommendationBatches)
    .values({ userId, prompt, name: null })
    .returning();
  if (!batch) throw new Error("Failed to create recommendation batch");
  console.log(
    `[rec] batch created: ${batch.id}${prompt ? ` (prompt="${prompt}")` : " (default)"}`,
  );

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

  const library = await getUserLibrary(userId, profile);
  const librarySources = library.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[rec] library: ${library.length} items will inform scoring`,
    librarySources,
  );

  // Step 1 — AI proposes candidates (prompt + library aware).
  const plan = await generateCandidatePlan(profile, prompt, library);
  const formatsInPlan = countByFormat(
    plan.titleSuggestions.map((s) => s.mediaType),
  );
  console.log(
    `[rec] plan: ${plan.titleSuggestions.length} titles, ${plan.discoveryQueries.length} queries — by format:`,
    formatsInPlan,
  );

  // Step 2 — validate against real APIs, deduping and excluding seen items
  // (already-recommended cache rows + profile favorites + avoid-list).
  const favorites = collectFavorites(profile);
  const avoidTitles = await collectAvoidTitles(userId, profile);
  console.log(
    `[rec] favorites set (${favorites.size}):`,
    Array.from(favorites).slice(0, 12),
  );
  console.log(
    `[rec] avoid set (${avoidTitles.size}):`,
    Array.from(avoidTitles).slice(0, 12),
  );
  const candidates = await collectRealCandidates(
    plan,
    seenCacheIds,
    favorites,
    avoidTitles,
    previouslyRecommendedTitles,
  );
  console.log(
    `[rec] validated: ${candidates.length} cache rows after dedupe + seen-filter — by format:`,
    countByFormat(candidates.map((c) => c.mediaType)),
  );
  if (candidates.length === 0) {
    throw new Error(
      "Recommendation pipeline produced 0 valid candidates — try widening the profile or onboarding more.",
    );
  }

  // Step 3 — AI scores real candidates with library context.
  const scored = await scoreCandidates(profile, candidates, {
    prompt,
    library,
  });
  console.log(
    `[rec] scored: ${scored.recommendations.length} recommendations returned by model`,
  );

  // Step 4 — persist scored recs against the batch.
  const saved = await persistRecommendations(
    userId,
    batch.id,
    candidates,
    scored,
  );
  console.log(
    `[rec] persisted: ${saved.length} rows (batch=${batch.id}) — by format:`,
    countByFormat(
      saved.map(
        (r) =>
          candidates.find((c) => c.id === r.mediaCacheId)?.mediaType ??
          "unknown",
      ),
    ),
  );
  return { batch, recs: saved };
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

  const response = await client.messages.parse({
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
  });

  if (!response.parsed_output) {
    throw new Error(
      `Candidate generation failed (stop_reason=${response.stop_reason})`,
    );
  }
  return CandidatesOutputSchema.parse(response.parsed_output);
}

async function collectRealCandidates(
  plan: CandidatesOutput,
  seenCacheIds: Set<string>,
  favorites: Set<string>,
  avoidTitles: Set<string>,
  previouslyRecommendedTitles: Set<string>,
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

  function consider(r: MediaCacheRow): void {
    if (seenCacheIds.has(r.id)) {
      droppedAsSeen++;
      return;
    }
    if (matchesKnown(r.normalizedData.title, favorites)) {
      droppedAsFavorite++;
      return;
    }
    if (matchesKnown(r.normalizedData.title, avoidTitles)) {
      droppedAsAvoided++;
      return;
    }
    if (matchesKnown(r.normalizedData.title, seenCanonicals)) {
      droppedAsDup++;
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
      console.warn(
        `[rec] title search failed for "${sug.title}" (${sug.mediaType}):`,
        settlement.reason instanceof Error
          ? settlement.reason.message
          : settlement.reason,
      );
      continue;
    }
    const { hits } = settlement.value;
    rawByFormat[sug.mediaType] = (rawByFormat[sug.mediaType] ?? 0) + hits.length;
    if (hits.length === 0) {
      console.warn(
        `[rec] title search returned 0 hits: "${sug.title}" (${sug.mediaType})`,
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
      console.warn(
        `[rec] discovery query failed (${q.mediaType}):`,
        settlement.reason instanceof Error
          ? settlement.reason.message
          : settlement.reason,
      );
      continue;
    }
    const { hits } = settlement.value;
    rawByFormat[q.mediaType] = (rawByFormat[q.mediaType] ?? 0) + hits.length;
    if (hits.length === 0) {
      console.warn(
        `[rec] discovery query returned 0 hits: ${q.mediaType} genres=[${q.genres.join(",")}]`,
      );
    }
    for (const r of hits) consider(r);
  }

  console.log(`[rec] raw hits before any filtering — by format:`, rawByFormat);

  console.log(
    `[rec] filtered: ${droppedAsSeen} already-recommended, ${droppedAsFavorite} matched profile favorite, ${droppedAsAvoided} matched negative-feedback title, ${droppedAsDup} canonical-title duplicate`,
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

  const response = await client.messages.parse({
    model: RECOMMENDER_MODEL,
    max_tokens: 4096,
    system: recommendScoreSystemPrompt(),
    messages: [{ role: "user", content: sections.join("\n\n") }],
    output_config: {
      format: zodOutputFormat(
        ScoredCandidatesOutputSchema as unknown as Parameters<
          typeof zodOutputFormat
        >[0],
      ),
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Scoring failed (stop_reason=${response.stop_reason})`,
    );
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
      console.warn(`[rec] model returned unknown candidateId: ${r.candidateId}`);
      continue;
    }
    rows.push({
      userId,
      batchId,
      mediaCacheId,
      matchScore: r.matchScore,
      explanation: r.explanation,
      tasteTags: r.tasteTags,
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
      .where(eq(recommendations.id, recommendationId))
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
    .where(eq(recommendations.id, recommendationId))
    .returning();
  if (!updated) throw new Error("Failed to update recommendation");
  return updated;
}
