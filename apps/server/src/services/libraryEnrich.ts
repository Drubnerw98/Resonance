import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { libraryItems, type LibraryItemRow } from "../db/schema.js";
import { searchAndCacheByTitle } from "./mediaCache.js";
import { logger } from "../lib/logger.js";

/**
 * Link a library item to the canonical metadata in `media_cache`, so the
 * watchlist UI can render the poster / runtime / blurb that the
 * recommendation pipeline already uses for its candidates. One source of
 * truth for media metadata across the app.
 *
 * Dispatches by mediaType through the existing adapter aggregator:
 *
 * | mediaType    | adapter      | source         |
 * | ------------ | ------------ | -------------- |
 * | movie, tv    | tmdbAdapter  | TMDB           |
 * | game         | igdbAdapter  | IGDB           |
 * | anime, manga | jikanAdapter | Jikan          |
 * | book         | openLibrary  | Open Library   |
 *
 * No-ops when the row already has a `mediaCacheId`. Failures (rate limit,
 * 0 hits, network blip) are swallowed and logged — the row keeps its
 * un-enriched title/year/source. The UI tolerates a null `mediaCacheId`
 * and falls back to text-only rendering.
 *
 * Best-match logic: take the first adapter result that matches the
 * mediaType. When the library row has a `year`, prefer a result whose
 * normalized data has the same year — disambiguates same-titled works
 * (the trade-off Letterboxd CSVs notoriously surface).
 */
export async function enrichLibraryItem(
  itemId: string,
): Promise<LibraryItemRow | null> {
  const [row] = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.id, itemId))
    .limit(1);
  if (!row) return null;
  if (row.mediaCacheId) return row;

  try {
    const candidates = await searchAndCacheByTitle(row.mediaType, row.title);
    if (candidates.length === 0) return row;

    // Year-disambiguated pick when both the library row and a candidate
    // carry a year; otherwise first match (adapters return most-relevant
    // first).
    let pick = candidates[0]!;
    if (row.year != null) {
      const yearMatch = candidates.find(
        (c) => c.normalizedData.year === row.year,
      );
      if (yearMatch) pick = yearMatch;
    }

    const [updated] = await db
      .update(libraryItems)
      .set({ mediaCacheId: pick.id })
      .where(eq(libraryItems.id, itemId))
      .returning();
    return updated ?? row;
  } catch (err) {
    logger.warn(
      {
        itemId,
        title: row.title,
        mediaType: row.mediaType,
        err: err instanceof Error ? err.message : String(err),
      },
      "libraryEnrich: failed, leaving item un-enriched",
    );
    return row;
  }
}

/**
 * Enrich every un-enriched library item for a user, capped at `limit`
 * (defaults to 50 to keep one drain manageable). Used by the
 * post-import endpoint that fires after a Letterboxd / Goodreads / MAL /
 * Steam import returns — gives the user's watchlist posters without
 * blocking the import response itself.
 *
 * `Promise.allSettled` so one rate-limit or 404 doesn't kill the batch.
 * Returns the count of rows that successfully picked up a cache id.
 */
export async function enrichLibraryItemsForUser(
  userId: string,
  limit = 50,
): Promise<{ enriched: number; attempted: number }> {
  const rows = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(eq(libraryItems.userId, userId), isNull(libraryItems.mediaCacheId)),
    )
    .limit(limit);
  if (rows.length === 0) return { enriched: 0, attempted: 0 };

  const results = await Promise.allSettled(
    rows.map((r) => enrichLibraryItem(r.id)),
  );
  // An "enriched" outcome is a fulfilled promise that returned a row WITH
  // a mediaCacheId set after the call. Failed lookups still resolve with
  // the un-enriched row, so we have to inspect the result.
  let enriched = 0;
  const enrichedIds: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value?.mediaCacheId) {
      enrichedIds.push(r.value.id);
      enriched++;
    }
  }
  return { enriched, attempted: rows.length };
}

/** Inline helper for the manual-add path: enriches a single just-inserted
 * row and returns its current state (with mediaCacheId set if a cache row
 * was found). Caller is responsible for selecting the row again if it
 * wants the joined media_cache row. */
export async function enrichSingleByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Sanity: only touch rows that actually need enrichment. Avoids re-firing
  // when the same id passes through this helper twice (idempotency for
  // future retry loops).
  const candidates = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(inArray(libraryItems.id, ids), isNull(libraryItems.mediaCacheId)),
    );
  await Promise.allSettled(candidates.map((c) => enrichLibraryItem(c.id)));
}
