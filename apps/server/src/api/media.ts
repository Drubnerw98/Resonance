import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { db } from "../db/index.js";
import { mediaCache } from "../db/schema.js";
import {
  searchAndCacheByQuery,
  searchAndCacheByTitle,
} from "../services/mediaCache.js";

export const mediaRouter: Router = Router();

mediaRouter.use(requireUser);
mediaRouter.param("cacheId", validateUuidParam);

const mediaTypeEnum = z.enum(["movie", "tv", "anime", "manga", "game", "book"]);

const searchSchema = z
  .object({
    mediaType: mediaTypeEnum,
    title: z.string().trim().min(1).optional(),
    genres: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    yearFrom: z.coerce.number().int().optional(),
    yearTo: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().min(1).max(40).optional(),
  })
  .refine(
    (v) => v.title || v.genres || v.keywords,
    "Provide at least one of: title, genres, keywords",
  );

/**
 * GET /api/media/search?mediaType=movie&title=disco+elysium
 * GET /api/media/search?mediaType=tv&genres=Drama,Mystery&yearFrom=2015
 *
 * Debug/utility endpoint. Searches the configured adapter for the given
 * media type, caches results in media_cache, and returns the cached rows.
 * Step 7's recommendation pipeline calls the underlying services directly;
 * this exists for verification and for future "search before recommend" UX.
 */
mediaRouter.get("/search", async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse({
      mediaType: req.query.mediaType,
      title: req.query.title,
      genres:
        typeof req.query.genres === "string"
          ? req.query.genres
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      keywords:
        typeof req.query.keywords === "string"
          ? req.query.keywords
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      yearFrom: req.query.yearFrom,
      yearTo: req.query.yearTo,
      limit: req.query.limit,
    });
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid query", issues: parsed.error.issues });
      return;
    }
    const q = parsed.data;

    const rows = q.title
      ? await searchAndCacheByTitle(q.mediaType, q.title)
      : await searchAndCacheByQuery({
          mediaType: q.mediaType,
          ...(q.genres ? { genres: q.genres } : {}),
          ...(q.keywords ? { keywords: q.keywords } : {}),
          ...(q.yearFrom !== undefined ? { yearFrom: q.yearFrom } : {}),
          ...(q.yearTo !== undefined ? { yearTo: q.yearTo } : {}),
          ...(q.limit !== undefined ? { limit: q.limit } : {}),
        });

    res.json({
      count: rows.length,
      results: rows.map((r) => ({
        cacheId: r.id,
        externalId: r.externalId,
        source: r.source,
        mediaType: r.mediaType,
        data: r.normalizedData,
        fetchedAt: r.fetchedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

mediaRouter.get("/:cacheId", async (req, res, next) => {
  try {
    const cacheId = req.params.cacheId!;
    const row = await db.query.mediaCache.findFirst({
      where: eq(mediaCache.id, cacheId),
    });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({
      cacheId: row.id,
      externalId: row.externalId,
      source: row.source,
      mediaType: row.mediaType,
      data: row.normalizedData,
      fetchedAt: row.fetchedAt,
    });
  } catch (err) {
    next(err);
  }
});
