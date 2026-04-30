import type { MediaItem, MediaSearchQuery, MediaType } from "@resonance/shared";
import { env } from "../../env.js";
import { createTokenBucket, type RateLimiter } from "../../lib/rateLimiter.js";
import type { MediaApiAdapter } from "./aggregator.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500"; // 500px-wide poster
const TMDB_HOMEPAGE = "https://www.themoviedb.org";

// 40 requests per 10 seconds, per TMDB's documented limit.
const tmdbLimiter: RateLimiter = createTokenBucket({
  capacity: 40,
  intervalMs: 10_000,
});

interface TmdbMovieRow {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
}

let cachedGenres: {
  movie: Map<number, string>;
  tv: Map<number, string>;
} | null = null;

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  await tmdbLimiter.acquire();
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.TMDB_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TMDB ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * TMDB returns genres as integer IDs on search/discover endpoints. We cache
 * the id→name mapping on first use so subsequent lookups are free.
 */
async function loadGenres(): Promise<{
  movie: Map<number, string>;
  tv: Map<number, string>;
}> {
  if (cachedGenres) return cachedGenres;
  const [m, t] = await Promise.all([
    tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
    tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
  ]);
  cachedGenres = {
    movie: new Map(m.genres.map((g) => [g.id, g.name])),
    tv: new Map(t.genres.map((g) => [g.id, g.name])),
  };
  return cachedGenres;
}

function pickMediaSubpath(mediaType: MediaType): "movie" | "tv" {
  if (mediaType === "movie") return "movie";
  if (mediaType === "tv") return "tv";
  throw new Error(`TMDB does not handle media type: ${mediaType}`);
}

function normalize(
  row: TmdbMovieRow,
  mediaType: "movie" | "tv",
  genreLookup: Map<number, string>,
): MediaItem {
  const title = (mediaType === "movie" ? row.title : row.name) ?? "Untitled";
  const dateStr =
    (mediaType === "movie" ? row.release_date : row.first_air_date) ?? "";
  const year = dateStr ? Number(dateStr.slice(0, 4)) : null;

  // Search endpoints return genre_ids; details endpoints return full genres.
  const genres = row.genres
    ? row.genres.map((g) => g.name)
    : (row.genre_ids ?? [])
        .map((id) => genreLookup.get(id))
        .filter((g): g is string => Boolean(g));

  return {
    externalId: String(row.id),
    source: "tmdb",
    mediaType,
    title,
    description: row.overview ?? "",
    imageUrl: row.poster_path ? `${IMAGE_BASE}${row.poster_path}` : null,
    rating: row.vote_average ?? null,
    year: Number.isFinite(year) ? year : null,
    genres,
    externalUrl: `${TMDB_HOMEPAGE}/${mediaType}/${row.id}`,
    metadata: {},
  };
}

async function searchByTitle(title: string): Promise<MediaItem[]> {
  const genreLookup = await loadGenres();
  // Hit both /movie and /tv in parallel and interleave by relevance score.
  const [movies, tv] = await Promise.all([
    tmdbFetch<{ results: TmdbMovieRow[] }>("/search/movie", {
      query: title,
      include_adult: "false",
      page: "1",
    }),
    tmdbFetch<{ results: TmdbMovieRow[] }>("/search/tv", {
      query: title,
      include_adult: "false",
      page: "1",
    }),
  ]);

  return [
    ...movies.results
      .slice(0, 5)
      .map((r) => normalize(r, "movie", genreLookup.movie)),
    ...tv.results.slice(0, 5).map((r) => normalize(r, "tv", genreLookup.tv)),
  ];
}

async function searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]> {
  const sub = pickMediaSubpath(query.mediaType);
  const genreLookup = await loadGenres();
  const lookup = sub === "movie" ? genreLookup.movie : genreLookup.tv;

  // /discover/{type} accepts genre IDs and a free-text "with_keywords" filter.
  // We don't currently translate keywords → keyword-IDs (that'd be an extra
  // /search/keyword call); instead we take the simpler path of fanning out
  // multiple title searches when keywords are supplied. Good enough for v1.
  if (query.keywords && query.keywords.length > 0) {
    const all = await Promise.all(
      query.keywords.map((kw) =>
        tmdbFetch<{ results: TmdbMovieRow[] }>(`/search/${sub}`, {
          query: kw,
          include_adult: "false",
          page: "1",
        }),
      ),
    );
    const seen = new Set<number>();
    const merged: MediaItem[] = [];
    for (const page of all) {
      for (const row of page.results) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(normalize(row, sub, lookup));
        if (merged.length >= (query.limit ?? 20)) return merged;
      }
    }
    return merged;
  }

  // Pure genre/year discovery.
  const params: Record<string, string> = {
    include_adult: "false",
    page: "1",
    sort_by: "popularity.desc",
  };
  if (query.genres && query.genres.length > 0) {
    const ids: number[] = [];
    for (const [id, name] of lookup) {
      if (query.genres.some((g) => g.toLowerCase() === name.toLowerCase())) {
        ids.push(id);
      }
    }
    if (ids.length > 0) params.with_genres = ids.join(",");
  }
  if (query.yearFrom)
    params[
      sub === "movie" ? "primary_release_date.gte" : "first_air_date.gte"
    ] = `${query.yearFrom}-01-01`;
  if (query.yearTo)
    params[
      sub === "movie" ? "primary_release_date.lte" : "first_air_date.lte"
    ] = `${query.yearTo}-12-31`;

  const res = await tmdbFetch<{ results: TmdbMovieRow[] }>(
    `/discover/${sub}`,
    params,
  );
  return res.results
    .slice(0, query.limit ?? 20)
    .map((r) => normalize(r, sub, lookup));
}

async function getById(externalId: string): Promise<MediaItem | null> {
  // TMDB IDs aren't typed (a "12345" can be a movie or TV id), so we try both.
  const genreLookup = await loadGenres();
  for (const sub of ["movie", "tv"] as const) {
    try {
      const row = await tmdbFetch<TmdbMovieRow>(`/${sub}/${externalId}`);
      return normalize(
        row,
        sub,
        sub === "movie" ? genreLookup.movie : genreLookup.tv,
      );
    } catch (err) {
      // Fall through to next type on 404; rethrow on other errors.
      if (!(err instanceof Error) || !err.message.startsWith("TMDB 404")) {
        throw err;
      }
    }
  }
  return null;
}

export const tmdbAdapter: MediaApiAdapter = {
  searchByTitle,
  searchByQuery,
  getById,
};
