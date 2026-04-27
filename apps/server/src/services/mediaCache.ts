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
 * Sequential rather than batched on purpose: Drizzle's neon-http driver
 * doesn't support multi-row ON CONFLICT cleanly with array inputs, and the
 * volumes here (5–20 items per call) don't justify the optimization.
 */
async function upsertItems(items: MediaItem[]): Promise<MediaCacheRow[]> {
  if (items.length === 0) return [];
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  const rows: MediaCacheRow[] = [];
  for (const item of items) {
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
    if (row) rows.push(row);
  }
  return rows;
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
