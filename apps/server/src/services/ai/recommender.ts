import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { TasteProfile, MediaSearchQuery } from "@resonance/shared";
import { db } from "../../db/index.js";
import {
  recommendations,
  type MediaCacheRow,
  type NewRecommendationRow,
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
function canonicalizeTitle(s: string): string {
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

function matchesKnown(candidate: string, known: Set<string>): boolean {
  const nc = canonicalizeTitle(candidate);
  if (known.has(nc)) return true;

  // Loose-equality check: two canonicals that differ only in internal
  // colon/dash placement are the same work. Catches "Planescape Torment"
  // (after suffix strip from "Planescape Torment: Enhanced Edition - Digital
  // Deluxe") matching "Planescape: Torment".
  const ncLoose = looseShape(nc);
  for (const k of known) {
    if (looseShape(k) === ncLoose) return true;
  }

  const sep = /^\s*[:\-–—&+,]\s/;
  for (const k of known) {
    // Candidate is the longer variant: "Foo: Bar" matches known "Foo".
    if (k.length >= 5 && nc.length > k.length && nc.startsWith(k)) {
      if (sep.test(nc.slice(k.length))) return true;
    }
    // Candidate is the shorter base title: "Foo" matches known "Foo: Bar".
    if (nc.length >= 5 && k.length > nc.length && k.startsWith(nc)) {
      if (sep.test(k.slice(nc.length))) return true;
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
 * Mode 3 orchestrator: 4-step recommendation pipeline.
 *
 *   1. Load the user's profile.
 *   2. Ask the model for ~15 title suggestions + ~5 discovery queries.
 *   3. For each, search the relevant adapter and persist hits to media_cache.
 *      Drop anything we've already recommended to this user.
 *   4. Send the surviving candidates' real metadata back to the model and
 *      have it score them.
 *   5. Persist a recommendations row per scored result, all sharing one
 *      batch_id so the frontend can group "this run".
 */
export async function generateRecommendations(
  userId: string,
): Promise<RecommendationRow[]> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    throw new Error(
      "Cannot generate recommendations: user has no taste profile yet",
    );
  }
  const profile = profileRow.profileData;

  const seenCacheIds = new Set(
    (
      await db.query.recommendations.findMany({
        where: eq(recommendations.userId, userId),
        columns: { mediaCacheId: true },
      })
    ).map((r) => r.mediaCacheId),
  );

  // Step 1 — AI proposes candidates.
  const plan = await generateCandidatePlan(profile);
  const formatsInPlan = countByFormat(
    plan.titleSuggestions.map((s) => s.mediaType),
  );
  console.log(
    `[rec] plan: ${plan.titleSuggestions.length} titles, ${plan.discoveryQueries.length} queries — by format:`,
    formatsInPlan,
  );

  // Step 2 — validate against real APIs, deduping and excluding seen items
  // (already-recommended cache rows + titles already named in onboarding).
  const favorites = collectFavorites(profile);
  console.log(
    `[rec] favorites set (${favorites.size}):`,
    Array.from(favorites).slice(0, 12),
  );
  const candidates = await collectRealCandidates(plan, seenCacheIds, favorites);
  console.log(
    `[rec] validated: ${candidates.length} cache rows after dedupe + seen-filter — by format:`,
    countByFormat(candidates.map((c) => c.mediaType)),
  );
  if (candidates.length === 0) {
    throw new Error(
      "Recommendation pipeline produced 0 valid candidates — try widening the profile or onboarding more.",
    );
  }

  // Step 3 — AI scores real candidates.
  const scored = await scoreCandidates(profile, candidates);
  console.log(
    `[rec] scored: ${scored.recommendations.length} recommendations returned by model`,
  );

  // Step 4 — persist scored recs.
  const batchId = randomUUID();
  const saved = await persistRecommendations(
    userId,
    batchId,
    candidates,
    scored,
  );
  console.log(
    `[rec] persisted: ${saved.length} rows (batch=${batchId}) — by format:`,
    countByFormat(
      saved.map(
        (r) =>
          candidates.find((c) => c.id === r.mediaCacheId)?.mediaType ??
          "unknown",
      ),
    ),
  );
  return saved;
}

function countByFormat(formats: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of formats) {
    counts[f] = (counts[f] ?? 0) + 1;
  }
  return counts;
}

async function generateCandidatePlan(
  profile: TasteProfile,
): Promise<CandidatesOutput> {
  const client = getAnthropic();
  const response = await client.messages.parse({
    model: RECOMMENDER_MODEL,
    max_tokens: 2048,
    system: recommendCandidatesSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Here is the taste profile.\n\n${JSON.stringify(profile, null, 2)}\n\nGenerate candidate recommendations.`,
      },
    ],
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
): Promise<MediaCacheRow[]> {
  const byCacheId = new Map<string, MediaCacheRow>();
  // Canonical titles we've already accepted into this batch — prevents
  // "Planescape: Torment" + "Enhanced Edition" both surviving, and catches
  // duplicate Open Library Work entries for the same novel.
  const seenCanonicals = new Set<string>();
  let droppedAsFavorite = 0;
  let droppedAsSeen = 0;
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

  // Title suggestions — fan out, tolerant of individual failures.
  for (const sug of plan.titleSuggestions) {
    try {
      const hits = await searchAndCacheByTitle(sug.mediaType, sug.title);
      rawByFormat[sug.mediaType] = (rawByFormat[sug.mediaType] ?? 0) + hits.length;
      if (hits.length === 0) {
        console.warn(
          `[rec] title search returned 0 hits: "${sug.title}" (${sug.mediaType})`,
        );
      }
      for (const r of hits) consider(r);
    } catch (err) {
      console.warn(
        `[rec] title search failed for "${sug.title}" (${sug.mediaType}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Discovery queries — genre-based only. Keywords were dropped from the
  // schema because abstract theme strings don't match how these APIs do
  // free-text search.
  for (const q of plan.discoveryQueries) {
    const query: MediaSearchQuery = {
      mediaType: q.mediaType,
      genres: q.genres,
      limit: 8,
    };
    try {
      const hits = await searchAndCacheByQuery(query);
      rawByFormat[q.mediaType] = (rawByFormat[q.mediaType] ?? 0) + hits.length;
      if (hits.length === 0) {
        console.warn(
          `[rec] discovery query returned 0 hits: ${q.mediaType} genres=[${q.genres.join(",")}]`,
        );
      }
      for (const r of hits) consider(r);
    } catch (err) {
      console.warn(
        `[rec] discovery query failed (${q.mediaType}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`[rec] raw hits before any filtering — by format:`, rawByFormat);

  console.log(
    `[rec] filtered: ${droppedAsSeen} already-recommended, ${droppedAsFavorite} matched profile favorite, ${droppedAsDup} canonical-title duplicate`,
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

async function scoreCandidates(
  profile: TasteProfile,
  candidates: MediaCacheRow[],
): Promise<ScoredCandidatesOutput> {
  const client = getAnthropic();

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
  const userMessage = `# User profile

${JSON.stringify(profile, null, 2)}

# Candidates (use the bracketed number as candidateId)

${candidateBlock}

# Task

You have ${candidates.length} candidates. Per the volume rule, return AT LEAST ${requiredFloor} recommendations. If you can't, you're not following instructions — re-read the system prompt.`;

  const response = await client.messages.parse({
    model: RECOMMENDER_MODEL,
    max_tokens: 4096,
    system: recommendScoreSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
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
