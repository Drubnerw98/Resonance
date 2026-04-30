import { eq } from "drizzle-orm";
import type { MediaItem, MediaSearchQuery, MediaType } from "@resonance/shared";
import { db } from "../db/index.js";
import { mediaCache, type MediaCacheRow } from "../db/schema.js";
import { getAdapterForType } from "./media/aggregator.js";

// 30 days. External metadata (titles, descriptions, ratings) drift slowly
// enough that monthly refresh is fine. Step 7's recommendation pipeline can
// always force-refresh a row by calling the adapter directly.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Insert or refresh a batch of media items in media_cache. Keyed on the
 * (source, external_id) unique we set up in the schema, so re-running this
 * with the same items just updates the rows in place.
 *
 * Per-row inserts in parallel rather than a single multi-row insert because
 * Drizzle's neon-http driver doesn't support multi-row ON CONFLICT cleanly
 * with array inputs. Each row is independent, so Promise.all is safe and
 * collapses what was previously N sequential round-trips.
 */
async function upsertItems(items: MediaItem[]): Promise<MediaCacheRow[]> {
  if (items.length === 0) return [];
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  const results = await Promise.all(
    items.map(async (item) => {
      const [row] = await db
        .insert(mediaCache)
        .values({
          externalId: item.externalId,
          source: item.source,
          mediaType: item.mediaType,
          title: item.title,
          normalizedData: item,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [mediaCache.source, mediaCache.externalId],
          set: {
            title: item.title,
            normalizedData: item,
            fetchedAt: new Date(),
            expiresAt,
          },
        })
        .returning();
      return row;
    }),
  );
  return results.filter((r): r is MediaCacheRow => r != null);
}

/**
 * Search by title for a specific media type, persist all hits to the cache,
 * and return the cached rows. The adapter for some types (notably TMDB) may
 * return mixed types from a title search; we filter to the requested type
 * before caching.
 */
export async function searchAndCacheByTitle(
  mediaType: MediaType,
  title: string,
): Promise<MediaCacheRow[]> {
  const adapter = getAdapterForType(mediaType);
  const items = await adapter.searchByTitle(title);
  const matching = items.filter((i) => i.mediaType === mediaType);
  return upsertItems(matching);
}

/**
 * Discovery-style search (genres, keywords, year range). Used by the
 * recommendation pipeline's discoveryQueries step.
 */
export async function searchAndCacheByQuery(
  query: MediaSearchQuery,
): Promise<MediaCacheRow[]> {
  const adapter = getAdapterForType(query.mediaType);
  const items = await adapter.searchByQuery(query);
  return upsertItems(items);
}

/**
 * Fill in fields that aren't returned by the lightweight search endpoints
 * — currently just `runtime` for TMDB movies/TV. Re-fetches details via
 * `getById` and updates media_cache in place. Skips rows that already have
 * a runtime, and skips non-TMDB rows (other adapters don't surface runtime
 * yet). Failures are swallowed per-row so one missing detail doesn't break
 * a whole batch enrichment.
 *
 * Called from the recommendation pipeline AFTER scoring, so we only spend
 * the extra API calls on items that actually become user-facing recs.
 */
export async function enrichWithRuntime(
  rows: MediaCacheRow[],
): Promise<MediaCacheRow[]> {
  const targets = rows.filter(
    (r) =>
      r.source === "tmdb" &&
      (r.mediaType === "movie" || r.mediaType === "tv") &&
      r.normalizedData.runtime == null,
  );
  if (targets.length === 0) return rows;

  const adapter = getAdapterForType("movie");
  const enriched = await Promise.all(
    targets.map(async (r) => {
      try {
        const details = await adapter.getById(r.normalizedData.externalId);
        if (details?.runtime == null) return r;
        const merged: MediaItem = {
          ...r.normalizedData,
          runtime: details.runtime,
        };
        const [updated] = await db
          .update(mediaCache)
          .set({ normalizedData: merged, fetchedAt: new Date() })
          .where(eq(mediaCache.id, r.id))
          .returning();
        return updated ?? r;
      } catch {
        // Detail fetch failures (404 on stale id, network blip) are
        // non-fatal — we just leave runtime null on this one row.
        return r;
      }
    }),
  );

  // Splice enriched rows back into the original ordering.
  const byId = new Map(enriched.map((r) => [r.id, r]));
  return rows.map((r) => byId.get(r.id) ?? r);
}
