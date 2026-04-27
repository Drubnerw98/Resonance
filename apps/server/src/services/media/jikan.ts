import type { MediaItem, MediaSearchQuery, MediaType } from "@resonance/shared";
import { createTokenBucket, type RateLimiter } from "../../lib/rateLimiter.js";
import type { MediaApiAdapter } from "./aggregator.js";

const JIKAN_BASE = "https://api.jikan.moe/v4";

// Jikan's docs say 3 req/s but their server-side limiter is stricter in
// practice — bursts of 2-3 parallel requests within the same second tend to
// 429 even when long-run averages are well under the limit. We constrain to
// 1 token at 500ms refill (2/s sustained, no bursts) and additionally retry
// on 429 with the Retry-After hint below.
const jikanLimiter: RateLimiter = createTokenBucket({
  capacity: 1,
  intervalMs: 500,
});

interface JikanItem {
  mal_id: number;
  title: string;
  title_english?: string | null;
  synopsis?: string | null;
  images?: { jpg?: { large_image_url?: string } };
  score?: number | null;
  aired?: { from?: string | null };
  published?: { from?: string | null };
  genres?: { name: string }[];
  url?: string;
}

interface JikanResponse<T> {
  data: T;
}

async function jikanFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${JIKAN_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await jikanLimiter.acquire();
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (res.status === 429 && attempt < maxAttempts) {
      // Jikan returns Retry-After in seconds; default to a generous backoff
      // if the header is missing.
      const retryAfter = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Jikan ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as T;
  }
  throw new Error("Jikan: rate-limit retries exhausted");
}

function pickSubpath(mediaType: MediaType): "anime" | "manga" {
  if (mediaType === "anime") return "anime";
  if (mediaType === "manga") return "manga";
  throw new Error(`Jikan does not handle media type: ${mediaType}`);
}

function yearFromDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = d.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function normalize(item: JikanItem, mediaType: "anime" | "manga"): MediaItem {
  const dateStr =
    mediaType === "anime" ? item.aired?.from : item.published?.from;
  return {
    externalId: String(item.mal_id),
    source: "jikan",
    mediaType,
    title: item.title_english ?? item.title,
    description: item.synopsis ?? "",
    imageUrl: item.images?.jpg?.large_image_url ?? null,
    rating: item.score ?? null,
    year: yearFromDate(dateStr),
    genres: (item.genres ?? []).map((g) => g.name),
    externalUrl: item.url ?? `https://myanimelist.net/${mediaType}/${item.mal_id}`,
    metadata: {},
  };
}

// Genre IDs are stable, so we cache the lookup on first use.
let cachedGenres: { anime: Map<string, number>; manga: Map<string, number> } | null =
  null;

async function loadGenres(): Promise<{
  anime: Map<string, number>;
  manga: Map<string, number>;
}> {
  if (cachedGenres) return cachedGenres;
  const [a, m] = await Promise.all([
    jikanFetch<JikanResponse<{ mal_id: number; name: string }[]>>(
      "/genres/anime",
    ),
    jikanFetch<JikanResponse<{ mal_id: number; name: string }[]>>(
      "/genres/manga",
    ),
  ]);
  cachedGenres = {
    anime: new Map(
      a.data.map((g) => [g.name.toLowerCase(), g.mal_id]),
    ),
    manga: new Map(
      m.data.map((g) => [g.name.toLowerCase(), g.mal_id]),
    ),
  };
  return cachedGenres;
}

async function searchByTitle(title: string): Promise<MediaItem[]> {
  // Hit anime and manga in parallel; cache layer filters by type if needed.
  const [anime, manga] = await Promise.all([
    jikanFetch<JikanResponse<JikanItem[]>>("/anime", {
      q: title,
      limit: "5",
    }),
    jikanFetch<JikanResponse<JikanItem[]>>("/manga", {
      q: title,
      limit: "5",
    }),
  ]);
  return [
    ...anime.data.map((i) => normalize(i, "anime")),
    ...manga.data.map((i) => normalize(i, "manga")),
  ];
}

async function searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]> {
  const sub = pickSubpath(query.mediaType);
  const params: Record<string, string> = {
    limit: String(query.limit ?? 20),
    order_by: "score",
    sort: "desc",
  };

  if (query.keywords && query.keywords.length > 0) {
    params.q = query.keywords.join(" ");
  }

  if (query.genres && query.genres.length > 0) {
    const lookup = (await loadGenres())[sub];
    const ids: number[] = [];
    for (const name of query.genres) {
      const id = lookup.get(name.toLowerCase());
      if (id) ids.push(id);
    }
    if (ids.length > 0) params.genres = ids.join(",");
  }

  if (query.yearFrom) params.start_date = `${query.yearFrom}-01-01`;
  if (query.yearTo) params.end_date = `${query.yearTo}-12-31`;

  // Without any criteria the endpoint returns the catalog top-rated. That's
  // not useful for discovery, so require at least one filter.
  if (!params.q && !params.genres && !params.start_date && !params.end_date) {
    return [];
  }

  const res = await jikanFetch<JikanResponse<JikanItem[]>>(`/${sub}`, params);
  return res.data.map((i) => normalize(i, sub));
}

async function getById(externalId: string): Promise<MediaItem | null> {
  // MAL IDs aren't typed (anime ID and manga ID share namespaces but with
  // different rows); try anime first, fall back to manga.
  for (const sub of ["anime", "manga"] as const) {
    try {
      const res = await jikanFetch<JikanResponse<JikanItem>>(
        `/${sub}/${externalId}`,
      );
      return normalize(res.data, sub);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Jikan 404")) continue;
      throw err;
    }
  }
  return null;
}

export const jikanAdapter: MediaApiAdapter = {
  searchByTitle,
  searchByQuery,
  getById,
};
