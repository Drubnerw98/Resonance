import { and, desc, eq } from "drizzle-orm";
import type { MediaType } from "@resonance/shared";
import { db } from "../db/index.js";
import {
  libraryItems,
  type LibraryItemRow,
  type NewLibraryItemRow,
} from "../db/schema.js";

/**
 * Minimal CSV parser. Handles double-quoted fields with embedded commas and
 * escaped double quotes (the standard CSV escape: "" inside a quoted field
 * means a literal "). Letterboxd / Goodreads exports both fit this profile
 * — no need for a full library.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (char === "\n" || char === "\r") {
        // \r\n or \n line endings — emit row
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        // Skip an immediate \n after \r
        if (char === "\r" && text[i + 1] === "\n") i += 2;
        else i++;
      } else {
        field += char;
        i++;
      }
    }
  }

  // Emit the final row if not blank
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * Parse a Letterboxd CSV export into library item rows. Letterboxd's
 * watched/diary/watchlist exports all share the columns:
 *   Date, Name, Year, Letterboxd URI[, Rating]
 * We treat every entry as a movie. Rating is optional and on a 1-10 scale
 * (half stars = 1-10) — convert to 1-5.
 */
export function parseLetterboxdCSV(text: string): NewLibraryItemRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const yearIdx = header.indexOf("year");
  const ratingIdx = header.indexOf("rating");

  if (nameIdx === -1) {
    throw new Error(
      "Letterboxd CSV missing 'Name' column — is this the right export?",
    );
  }

  const items: NewLibraryItemRow[] = [];
  for (const row of rows.slice(1)) {
    const title = row[nameIdx]?.trim();
    if (!title) continue;

    const yearRaw = yearIdx !== -1 ? row[yearIdx]?.trim() : undefined;
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

    const ratingRaw = ratingIdx !== -1 ? row[ratingIdx]?.trim() : undefined;
    let rating: number | null = null;
    if (ratingRaw && ratingRaw.length > 0) {
      const n = Number(ratingRaw);
      // Letterboxd stars: 0.5–5.0 in half-step increments.
      if (Number.isFinite(n) && n >= 0.5 && n <= 5) {
        rating = Math.round(n);
      }
    }

    items.push({
      // userId set by caller
      userId: "",
      title,
      mediaType: "movie",
      source: "letterboxd",
      rating,
      year,
    });
  }
  return items;
}

/**
 * Parse a Goodreads CSV export into library item rows. Goodreads exports
 * a single library.csv covering every shelf. We ingest:
 *   - "read" → status="consumed" (with star ratings if present)
 *   - "to-read" → status="watchlist" (no rating; user hasn't read it)
 *   - everything else (currently-reading, custom shelves) → skipped
 *
 * Watchlist entries don't anchor cross-references in explanations (the user
 * hasn't actually read them), but they DO go into the recommender's dedup
 * pool so the same titles aren't surfaced as new recommendations later.
 *
 * Columns we care about:
 *   Title, My Rating (0-5 integer; 0 = unrated), Year Published,
 *   Original Publication Year, Exclusive Shelf
 *
 * Rating: Goodreads is 1-5 integer stars and uses 0 to mean unrated. We
 * keep null in the unrated case so it doesn't trigger the avoid-set logic.
 *
 * Year: prefer Original Publication Year (matches the work, not the edition);
 * fall back to Year Published.
 */
export function parseGoodreadsCSV(text: string): NewLibraryItemRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const titleIdx = header.indexOf("title");
  const ratingIdx = header.indexOf("my rating");
  const origYearIdx = header.indexOf("original publication year");
  const yearIdx = header.indexOf("year published");
  const shelfIdx = header.indexOf("exclusive shelf");

  if (titleIdx === -1) {
    throw new Error(
      "Goodreads CSV missing 'Title' column — is this the right export?",
    );
  }

  const items: NewLibraryItemRow[] = [];
  for (const row of rows.slice(1)) {
    const title = row[titleIdx]?.trim();
    if (!title) continue;

    // Decide ingestion status based on shelf:
    //   read → consumed (with rating)
    //   to-read → watchlist (no rating, even if column is present)
    //   anything else (currently-reading, custom) → skip
    let status: "consumed" | "watchlist" = "consumed";
    if (shelfIdx !== -1) {
      const shelf = row[shelfIdx]?.trim().toLowerCase();
      if (shelf === "read") {
        status = "consumed";
      } else if (shelf === "to-read") {
        status = "watchlist";
      } else if (shelf) {
        // Currently-reading or custom shelves — not yet engaged enough to be
        // useful as either signal. Skip.
        continue;
      }
      // If shelf is absent (older export format), default to "consumed" and
      // trust the user to clean up.
    }

    let year: number | null = null;
    if (origYearIdx !== -1) {
      const raw = row[origYearIdx]?.trim();
      if (raw && /^-?\d{1,4}$/.test(raw)) year = Number(raw);
    }
    if (year == null && yearIdx !== -1) {
      const raw = row[yearIdx]?.trim();
      if (raw && /^-?\d{1,4}$/.test(raw)) year = Number(raw);
    }

    // Watchlist entries don't carry a meaningful rating (user hasn't read
    // them); ignore the My Rating column for those.
    let rating: number | null = null;
    if (status === "consumed") {
      const ratingRaw = ratingIdx !== -1 ? row[ratingIdx]?.trim() : undefined;
      if (ratingRaw && ratingRaw.length > 0) {
        const n = Number(ratingRaw);
        // 0 means unrated on Goodreads; keep null. 1-5 are real ratings.
        if (Number.isFinite(n) && n >= 1 && n <= 5) rating = Math.round(n);
      }
    }

    items.push({
      userId: "",
      title,
      mediaType: "book",
      source: "goodreads",
      status,
      rating,
      year,
    });
  }
  return items;
}

/**
 * Insert library items, deduping at the (userId, mediaType, title) unique
 * index. Returns the count of items actually inserted (existing duplicates
 * are silently skipped).
 */
export async function importLibraryItems(
  userId: string,
  rows: NewLibraryItemRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const withUserId = rows.map((r) => ({ ...r, userId }));
  const inserted = await db
    .insert(libraryItems)
    .values(withUserId)
    .onConflictDoNothing({
      target: [libraryItems.userId, libraryItems.mediaType, libraryItems.title],
    })
    .returning({ id: libraryItems.id });
  return inserted.length;
}

export async function listLibraryItems(
  userId: string,
): Promise<LibraryItemRow[]> {
  return db.query.libraryItems.findMany({
    where: eq(libraryItems.userId, userId),
    orderBy: [desc(libraryItems.createdAt)],
  });
}

export async function deleteLibraryItem(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId)))
    .returning({ id: libraryItems.id });
  return result.length > 0;
}

export async function addLibraryItem(
  userId: string,
  input: {
    title: string;
    mediaType: MediaType;
    year?: number;
    rating?: number;
    status?: "consumed" | "watchlist";
    source?: string;
  },
): Promise<LibraryItemRow | null> {
  const [row] = await db
    .insert(libraryItems)
    .values({
      userId,
      title: input.title.trim(),
      mediaType: input.mediaType,
      source: input.source ?? "manual",
      status: input.status ?? "consumed",
      year: input.year ?? null,
      rating: input.rating ?? null,
    })
    .onConflictDoNothing({
      target: [libraryItems.userId, libraryItems.mediaType, libraryItems.title],
    })
    .returning();
  return row ?? null;
}
