/**
 * Held-out recall@K — the "would the recommender find this title if it
 * didn't already know about it?" metric.
 *
 * For each held-out title:
 *   1. Verify it's a "clean" candidate — in the user's library at a strong
 *      rating, AND not surfaced through any other channel (favorites,
 *      previously recommended). A title surfaced elsewhere can't be a fair
 *      held-out test.
 *   2. Run the full recommendation pipeline with the title hidden from
 *      `getUserLibrary` via the new `excludeLibraryTitles` option.
 *   3. Inspect the resulting batch — if a rec's title canonicalizes to
 *      match the held-out, count it a recall hit.
 *
 * Caveat the report flags explicitly: the recommender is non-deterministic;
 * a single trial is noisy. Multi-trial averaging is a future-work item.
 *
 * Cost: each held-out probe = 1 full pipeline run (~$0.05-0.15, ~60s wall).
 * Default N=3 keeps the eval under a dollar per invocation.
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { generateRecommendations } from "@resonance/server/recommender";
import { simpleCanonicalize } from "./canonicalize.js";
import {
  db,
  libraryItems,
  mediaCache,
  recommendations,
  tasteProfiles,
} from "./db.js";

const DEFAULT_HELD_OUT_N = 3;

export interface HeldOutProbeResult {
  heldOutTitle: string;
  heldOutMediaType: string;
  heldOutRating: number | null;
  /** The batch the pipeline produced. Null when the pipeline crashed
   * before completing — see `error` for diagnostic. */
  batchId: string | null;
  recCount: number;
  hit: boolean;
  /** When hit=true, the actual rec title that matched (may differ from
   * the held-out title via the canonicalizer — useful for the report). */
  hitTitle: string | null;
  /** Wall-clock seconds for the pipeline run. */
  runtimeSeconds: number;
  /** Pipeline failure message, if any. A probe with `error` set is excluded
   * from the recall denominator — we can't say the system missed a title
   * if the pipeline never got to score candidates. */
  error: string | null;
}

export interface HeldOutRunResult {
  userId: string;
  heldOutCount: number;
  hits: number;
  recall: number;
  probes: HeldOutProbeResult[];
  /** Reasons a candidate library row was rejected as not-clean — useful
   * context when the user has too few clean candidates to fill N. */
  skipped: { title: string; reason: string }[];
}

export interface RunHeldOutOptions {
  userId: string;
  n?: number;
}

/**
 * Pick "clean" held-out candidates — library rows the user rated 4-5,
 * status=consumed, NOT in profile.mediaAffinities.favorites, NOT in any
 * past recommendation. A held-out title surfaced through any other channel
 * leaks signal, so we skip those rather than count an unfair test.
 */
async function pickCleanCandidates(
  userId: string,
  n: number,
): Promise<{
  candidates: { title: string; mediaType: string; rating: number }[];
  skipped: { title: string; reason: string }[];
}> {
  const skipped: { title: string; reason: string }[] = [];

  const profile = await db.query.tasteProfiles.findFirst({
    where: eq(tasteProfiles.userId, userId),
  });
  if (!profile) {
    return { candidates: [], skipped: [{ title: "—", reason: "no profile" }] };
  }
  const favoriteCanons = new Set<string>();
  for (const aff of profile.profileData.mediaAffinities) {
    for (const fav of aff.favorites) favoriteCanons.add(simpleCanonicalize(fav));
  }

  const recommendedTitleRows = await db
    .select({ title: mediaCache.title })
    .from(recommendations)
    .innerJoin(mediaCache, eq(recommendations.mediaCacheId, mediaCache.id))
    .where(eq(recommendations.userId, userId));
  const recommendedCanons = new Set(
    recommendedTitleRows.map((r) => simpleCanonicalize(r.title)),
  );

  // Pull library rows at rating 4-5, newest first. Newest-first means we
  // pick recent strong signals — a "this is current me" sample rather than
  // ancient ratings that may not reflect today's taste.
  const libraryRows = await db.query.libraryItems.findMany({
    where: and(
      eq(libraryItems.userId, userId),
      eq(libraryItems.status, "consumed"),
      or(eq(libraryItems.rating, 4), eq(libraryItems.rating, 5)),
    ),
    orderBy: [sql`created_at desc`],
    limit: 50,
  });

  const candidates: { title: string; mediaType: string; rating: number }[] = [];
  for (const row of libraryRows) {
    if (candidates.length >= n) break;
    const canon = simpleCanonicalize(row.title);
    if (favoriteCanons.has(canon)) {
      skipped.push({
        title: row.title,
        reason: "also in profile.mediaAffinities.favorites",
      });
      continue;
    }
    if (recommendedCanons.has(canon)) {
      skipped.push({
        title: row.title,
        reason: "previously recommended (would be in dedup set)",
      });
      continue;
    }
    candidates.push({
      title: row.title,
      mediaType: row.mediaType,
      rating: row.rating!,
    });
  }
  return { candidates, skipped };
}

export async function runHeldOut(
  options: RunHeldOutOptions,
): Promise<HeldOutRunResult> {
  const n = options.n ?? DEFAULT_HELD_OUT_N;
  const { candidates, skipped } = await pickCleanCandidates(options.userId, n);

  const probes: HeldOutProbeResult[] = [];
  let hits = 0;

  for (const c of candidates) {
    const startMs = Date.now();
    try {
      const result = await generateRecommendations(options.userId, {
        excludeLibraryTitles: [c.title],
      });
      const runtimeSeconds = Number(((Date.now() - startMs) / 1000).toFixed(1));

      const recs = await db.query.recommendations.findMany({
        where: inArray(
          recommendations.id,
          result.recs.map((r) => r.id),
        ),
        with: { media: true },
      });

      const heldOutCanon = simpleCanonicalize(c.title);
      const match = recs.find(
        (r) => simpleCanonicalize(r.media.title) === heldOutCanon,
      );
      const hit = match !== undefined;
      if (hit) hits += 1;
      probes.push({
        heldOutTitle: c.title,
        heldOutMediaType: c.mediaType,
        heldOutRating: c.rating,
        batchId: result.batch.id,
        recCount: result.recs.length,
        hit,
        hitTitle: match?.media.title ?? null,
        runtimeSeconds,
        error: null,
      });
    } catch (err) {
      // Pipeline errors are real findings (truncated structured output,
      // adapter outages, rate limits) but they're not recall failures —
      // we don't know whether the system would have found the title.
      // Surface them in the report; exclude from the recall denominator.
      const runtimeSeconds = Number(((Date.now() - startMs) / 1000).toFixed(1));
      const message = err instanceof Error ? err.message : String(err);
      probes.push({
        heldOutTitle: c.title,
        heldOutMediaType: c.mediaType,
        heldOutRating: c.rating,
        batchId: null,
        recCount: 0,
        hit: false,
        hitTitle: null,
        runtimeSeconds,
        error: message,
      });
    }
  }

  const scoredProbes = probes.filter((p) => p.error === null);
  const recall = scoredProbes.length > 0 ? hits / scoredProbes.length : 0;
  return {
    userId: options.userId,
    heldOutCount: scoredProbes.length,
    hits,
    recall,
    probes,
    skipped,
  };
}
