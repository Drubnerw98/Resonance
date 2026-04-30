import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireUser } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { libraryItems } from "../db/schema.js";
import {
  addLibraryItem,
  deleteLibraryItem,
  importLibraryItems,
  listLibraryItems,
  parseGoodreadsCSV,
  parseLetterboxdCSV,
  parseLetterboxdWatchlistCSV,
  parseMyAnimeListXML,
} from "../services/library.js";
import { fetchOwnedGames, resolveSteamId } from "../services/steam.js";

export const libraryRouter: Router = Router();

libraryRouter.use(requireUser);

const mediaTypeEnum = z.enum(["movie", "tv", "anime", "manga", "game", "book"]);

/**
 * GET /api/library
 * Returns the user's library items, newest first.
 */
libraryRouter.get("/", async (req, res, next) => {
  try {
    const rows = await listLibraryItems(req.user!.id);
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

const addBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    mediaType: mediaTypeEnum,
    year: z.number().int().min(1800).max(2100).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    status: z.enum(["consumed", "watchlist"]).optional(),
  })
  .strict();

/**
 * POST /api/library
 * Add a single library item manually. Body: { title, mediaType, year?, rating? }
 */
libraryRouter.post("/", async (req, res, next) => {
  try {
    const parsed = addBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }
    const row = await addLibraryItem(req.user!.id, {
      title: parsed.data.title,
      mediaType: parsed.data.mediaType,
      ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
      ...(parsed.data.rating !== undefined
        ? { rating: parsed.data.rating }
        : {}),
      ...(parsed.data.status !== undefined
        ? { status: parsed.data.status }
        : {}),
    });
    if (!row) {
      res.status(409).json({ error: "already in library" });
      return;
    }
    res.status(201).json({ item: row });
  } catch (err) {
    next(err);
  }
});

const patchBodySchema = z
  .object({
    status: z.enum(["consumed", "watchlist"]).optional(),
    rating: z.number().int().min(1).max(5).optional().nullable(),
  })
  .strict();

/**
 * PATCH /api/library/:id
 * Update mutable fields on a library item — currently `status` (flip
 * watchlist ↔ consumed) and `rating`. Used by the "Mark consumed" action
 * in the watchlist UI.
 */
libraryRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = req.params.id!;
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }
    const updates: {
      status?: "consumed" | "watchlist";
      rating?: number | null;
    } = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.rating !== undefined) updates.rating = parsed.data.rating;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "no fields to update" });
      return;
    }
    const [updated] = await db
      .update(libraryItems)
      .set(updates)
      .where(
        and(eq(libraryItems.id, id), eq(libraryItems.userId, req.user!.id)),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ item: updated });
  } catch (err) {
    next(err);
  }
});

const importBodySchema = z
  .object({
    // "letterboxd-watchlist" is a dispatch label, not a row source — items
    // imported via this path still land with source="letterboxd"; only their
    // status differs (watchlist vs. consumed).
    source: z.enum([
      "letterboxd",
      "letterboxd-watchlist",
      "goodreads",
      "myanimelist",
    ]),
    // Reused for CSV (Letterboxd, Goodreads) and XML (MyAnimeList) — same
    // upload mechanism, parser dispatches by source.
    csv: z.string().min(1).max(5_000_000), // 5MB cap (MAL XML can be large)
  })
  .strict();

/**
 * POST /api/library/import
 * Body: { source: "letterboxd", csv: string }
 * Parses the supplied CSV text and bulk-inserts library items, deduping
 * against existing entries.
 */
libraryRouter.post("/import", async (req, res, next) => {
  try {
    const parsed = importBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }

    const { source, csv } = parsed.data;
    let items: ReturnType<typeof parseLetterboxdCSV>;
    try {
      if (source === "letterboxd") {
        items = parseLetterboxdCSV(csv);
      } else if (source === "letterboxd-watchlist") {
        items = parseLetterboxdWatchlistCSV(csv);
      } else if (source === "goodreads") {
        items = parseGoodreadsCSV(csv);
      } else if (source === "myanimelist") {
        items = parseMyAnimeListXML(csv);
      } else {
        res.status(400).json({ error: `unsupported source: ${source}` });
        return;
      }
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Parse failed" });
      return;
    }

    const inserted = await importLibraryItems(req.user!.id, items);
    res.json({
      parsed: items.length,
      inserted,
      duplicates: items.length - inserted,
    });
  } catch (err) {
    next(err);
  }
});

const importSteamBodySchema = z
  .object({
    /** Accepts: 64-bit SteamID, /profiles/ URL, /id/<vanity> URL, or
     * bare vanity name. Server resolves vanity inputs via Steam's
     * ResolveVanityURL. */
    steamIdOrUrl: z.string().trim().min(1).max(200),
  })
  .strict();

/**
 * POST /api/library/import-steam
 * Body: { steamIdOrUrl }. Resolves to a 64-bit Steam ID, fetches owned
 * games via the Steam Web API, bulk-inserts as library_items with
 * status="consumed", source="steam". Owned games only — wishlist support
 * depends on a deprecated/changing Valve endpoint and is deferred.
 */
libraryRouter.post("/import-steam", async (req, res, next) => {
  try {
    const parsed = importSteamBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }

    let steamId: string;
    let items;
    try {
      steamId = await resolveSteamId(parsed.data.steamIdOrUrl);
      items = await fetchOwnedGames(steamId);
    } catch (err) {
      // Steam-side errors (private profile, vanity not found, etc.) are
      // user-facing — surface as 400 with the helpful message we already
      // crafted in the service.
      res.status(400).json({
        error: err instanceof Error ? err.message : "Steam fetch failed",
      });
      return;
    }

    const inserted = await importLibraryItems(req.user!.id, items);
    res.json({
      parsed: items.length,
      inserted,
      duplicates: items.length - inserted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/library
 * Bulk-clear the user's library. Optional ?source=letterboxd query param
 * scopes the wipe to a single import source — useful for "remove all my
 * Letterboxd entries so I can re-import the right CSV" workflows.
 */
libraryRouter.delete("/", async (req, res, next) => {
  try {
    const source =
      typeof req.query.source === "string" ? req.query.source : null;
    const where = source
      ? and(
          eq(libraryItems.userId, req.user!.id),
          eq(libraryItems.source, source),
        )
      : eq(libraryItems.userId, req.user!.id);
    const deleted = await db
      .delete(libraryItems)
      .where(where)
      .returning({ id: libraryItems.id });
    res.json({ deleted: deleted.length });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/library/:id
 * Removes a single library item.
 */
libraryRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id!;
    const ok = await deleteLibraryItem(req.user!.id, id);
    if (!ok) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ deleted: id });
  } catch (err) {
    next(err);
  }
});
