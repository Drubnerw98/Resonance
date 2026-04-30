import { and, desc, eq } from "drizzle-orm";
import type { MediaType } from "@resonance/shared";
import { db } from "../db/index.js";
import {
  libraryItems,
  type LibraryItemRow,
  type NewLibraryItemRow,
} from "../db/schema.js";

type LibraryStatus = "consumed" | "watchlist";

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
 * Parse a Letterboxd watchlist.csv export. Same column shape as the
 * watched/diary exports, but every row maps to status="watchlist" and any
 * rating data is dropped (a watchlist entry, by definition, hasn't been
 * watched yet).
 *
 * Source field stays "letterboxd" — the status column is what distinguishes
 * watched from to-watch in our schema, so a single source label keeps the
 * "clear all my Letterboxd entries" wipe path simple.
 */
export function parseLetterboxdWatchlistCSV(text: string): NewLibraryItemRow[] {
  return parseLetterboxdCSV(text).map((item) => ({
    ...item,
    status: "watchlist",
    rating: null,
  }));
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
 * Parse a MyAnimeList XML export into library item rows. MAL exports one
 * type at a time (anime list OR manga list) but we accept both shapes —
 * anime entries appear as `<anime>...</anime>` blocks with `<series_title>`,
 * manga as `<manga>...</manga>` with `<manga_title>`. Title text is wrapped
 * in `<![CDATA[...]]>` so XML escaping isn't a concern.
 *
 * Status mapping:
 *   - "Completed"      → consumed (with score → rating)
 *   - "Plan to Watch"  → watchlist (anime; score ignored)
 *   - "Plan to Read"   → watchlist (manga; score ignored)
 *   - "Watching" / "Reading" / "On-Hold" / "Dropped" → skip (in-progress
 *     or ambiguous; not useful as either positive or negative signal)
 *
 * Score mapping (MAL 1-10 → app 1-5):
 *   - 9-10 → 5 (Masterpiece / Great)
 *   - 8     → 4 (Very Good — real endorsement)
 *   - 5-7   → 3 (Average / Fine / Good — neutral)
 *   - 3-4   → 2 (Bad / Very Bad — avoid signal)
 *   - 1-2   → 1 (Horrible / Appalling)
 *   - 0     → null (unrated on MAL)
 */
export function parseMyAnimeListXML(text: string): NewLibraryItemRow[] {
  if (!text.includes("<myanimelist>")) {
    throw new Error(
      "Doesn't look like a MyAnimeList XML export — missing <myanimelist> root.",
    );
  }

  const items: NewLibraryItemRow[] = [];

  for (const match of text.matchAll(/<anime>([\s\S]*?)<\/anime>/g)) {
    const item = parseMalEntry(match[1] ?? "", "series_title", "anime");
    if (item) items.push(item);
  }

  for (const match of text.matchAll(/<manga>([\s\S]*?)<\/manga>/g)) {
    const item = parseMalEntry(match[1] ?? "", "manga_title", "manga");
    if (item) items.push(item);
  }

  if (items.length === 0) {
    throw new Error(
      "MyAnimeList XML had no anime or manga entries with usable status — only Completed and Plan-to-Watch/Read entries are imported.",
    );
  }

  return items;
}

function parseMalEntry(
  block: string,
  titleTag: string,
  mediaType: MediaType,
): NewLibraryItemRow | null {
  const title = extractMalTag(block, titleTag);
  if (!title) return null;

  const malStatus = extractMalTag(block, "my_status");
  if (!malStatus) return null;

  const status = mapMalStatus(malStatus);
  if (!status) return null;

  let rating: number | null = null;
  if (status === "consumed") {
    const scoreStr = extractMalTag(block, "my_score");
    if (scoreStr) rating = mapMalScore(Number(scoreStr));
  }

  return {
    userId: "",
    title,
    mediaType,
    source: "myanimelist",
    status,
    rating,
    year: null,
  };
}

/** Pull a single tag's text content out of an XML block, handling CDATA
 * wrapping. Regex-only since the format is well-defined and tags don't
 * nest within entry blocks. */
function extractMalTag(block: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`,
  );
  const m = block.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").trim() || null;
}

function mapMalStatus(s: string): LibraryStatus | null {
  switch (s) {
    case "Completed":
      return "consumed";
    case "Plan to Watch":
    case "Plan to Read":
      return "watchlist";
    default:
      return null;
  }
}

function mapMalScore(score: number): number | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (score >= 9) return 5;
  if (score >= 8) return 4;
  if (score >= 5) return 3;
  if (score >= 3) return 2;
  return 1;
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
