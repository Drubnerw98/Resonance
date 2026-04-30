import type { MediaItem, MediaSearchQuery } from "@resonance/shared";
import { createTokenBucket, type RateLimiter } from "../../lib/rateLimiter.js";
import type { MediaApiAdapter } from "./aggregator.js";

const IGDB_BASE = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// 4 req/s per IGDB's documented limit.
const igdbLimiter: RateLimiter = createTokenBucket({
  capacity: 4,
  intervalMs: 1_000,
});

// IGDB doesn't have its own auth — it piggybacks on Twitch OAuth via the
// client-credentials grant. Tokens last ~60 days. We cache one in memory and
// refresh ~60 seconds before expiry. Concurrent callers waiting for a refresh
// share a single in-flight Promise to avoid token-fetch stampedes.
interface TokenState {
  accessToken: string;
  expiresAt: number;
}
let tokenState: TokenState | null = null;
let tokenPromise: Promise<string> | null = null;

async function fetchTokenInternal(): Promise<string> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set");
  }
  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twitch OAuth ${res.status}: ${body || res.statusText}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenState = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function getTwitchToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - 60_000) {
    return tokenState.accessToken;
  }
  if (!tokenPromise) {
    tokenPromise = fetchTokenInternal().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

interface IgdbGame {
  id: number;
  name?: string;
  summary?: string | null;
  cover?: { url?: string } | null;
  first_release_date?: number | null;
  total_rating?: number | null;
  total_rating_count?: number | null;
  genres?: { name: string }[];
  url?: string;
  /** 0=main_game, 1=dlc, 2=expansion, 4=standalone_expansion, 8=remake, 9=remaster, ... */
  category?: number | null;
}

/** Minimum aggregated reviews on a title-search hit. Filters obscure
 * promotional crossover entries (e.g. "AC Valhalla X Vinland Saga") that
 * IGDB indexes but no one has reviewed, while keeping legit niche games
 * with at least a small audience. */
const MIN_RATING_COUNT_FOR_TITLE_HIT = 5;

const STANDALONE_CATEGORY_SET = new Set([0, 4, 8, 9]);

function isStandaloneCategory(g: IgdbGame): boolean {
  // Allow null categories through in title searches — legacy IGDB entries
  // sometimes lack a category but are still real games. The where-clause
  // filter (used in discovery queries) is stricter.
  return g.category == null || STANDALONE_CATEGORY_SET.has(g.category);
}

async function igdbFetch<T>(endpoint: string, body: string): Promise<T> {
  const clientId = process.env.IGDB_CLIENT_ID!;
  const token = await getTwitchToken();
  await igdbLimiter.acquire();
  const res = await fetch(`${IGDB_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`IGDB ${res.status}: ${errBody || res.statusText}`);
  }
  return (await res.json()) as T;
}

function coverUrl(cover: IgdbGame["cover"]): string | null {
  // IGDB cover URLs come back protocol-relative ("//images.igdb.com/...") and
  // at thumbnail size ("t_thumb"). Upscale to a usable display size and add
  // the https: prefix.
  if (!cover?.url) return null;
  const upscaled = cover.url.replace("t_thumb", "t_cover_big");
  return upscaled.startsWith("//") ? `https:${upscaled}` : upscaled;
}

function yearFromUnix(seconds: number | null | undefined): number | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).getFullYear();
}

function normalize(g: IgdbGame): MediaItem {
  return {
    externalId: String(g.id),
    source: "igdb",
    mediaType: "game",
    title: g.name ?? "Untitled",
    description: g.summary ?? "",
    imageUrl: coverUrl(g.cover),
    // IGDB ratings are 0-100; our spec is 0-10 to match TMDB/Jikan.
    rating: g.total_rating != null ? g.total_rating / 10 : null,
    year: yearFromUnix(g.first_release_date),
    genres: (g.genres ?? []).map((x) => x.name),
    externalUrl: g.url ?? `https://www.igdb.com/games/${g.id}`,
    metadata: {},
  };
}

function escapeApicalypse(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const FIELDS =
  "name, summary, cover.url, first_release_date, total_rating, total_rating_count, genres.name, url, category";

// IGDB's `category` field — see STANDALONE_CATEGORY_SET above for which
// values count as "a thing the player would consider playing on its own".
// We filter on this CLIENT-SIDE in every adapter call, never via IGDB's
// where-clause tuple match, because that combination has empirically
// zeroed out otherwise-good queries.

async function searchByTitle(title: string): Promise<MediaItem[]> {
  // Don't combine `search` with a `where category = (...)` clause — IGDB
  // applies the where to the top-30 results returned by the search ranker,
  // and in practice that produces 0 hits even when the main game exists.
  // Filter category client-side instead. Also drop entries with effectively
  // no reviews — those are typically promotional crossovers, fan content,
  // or trivia entries that pollute the recommendation feed.
  const body = `fields ${FIELDS}; search "${escapeApicalypse(title)}"; limit 15;`;
  const games = await igdbFetch<IgdbGame[]>("/games", body);
  return games
    .filter(isStandaloneCategory)
    .filter(
      (g) => (g.total_rating_count ?? 0) >= MIN_RATING_COUNT_FOR_TITLE_HIT,
    )
    .slice(0, 10)
    .map(normalize);
}

async function searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]> {
  if (query.mediaType !== "game") {
    throw new Error("igdb only handles 'game' media type");
  }
  const limit = query.limit ?? 20;

  // Keyword path: same caveat as title search — don't combine `search` with
  // `where`, filter category in code.
  if (query.keywords && query.keywords.length > 0) {
    const seen = new Set<number>();
    const merged: IgdbGame[] = [];
    for (const kw of query.keywords) {
      const body = `fields ${FIELDS}; search "${escapeApicalypse(kw)}"; limit ${limit};`;
      const games = await igdbFetch<IgdbGame[]>("/games", body);
      for (const g of games) {
        if (seen.has(g.id)) continue;
        if (!isStandaloneCategory(g)) continue;
        seen.add(g.id);
        merged.push(g);
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    return merged.map(normalize);
  }

  // Filter path: where-clause on genre.name and release-date range.
  const wheres: string[] = [];
  if (query.genres && query.genres.length > 0) {
    const list = query.genres.map((g) => `"${escapeApicalypse(g)}"`).join(",");
    wheres.push(`genres.name = (${list})`);
  }
  if (query.yearFrom) {
    const ts = Math.floor(new Date(`${query.yearFrom}-01-01`).getTime() / 1000);
    wheres.push(`first_release_date >= ${ts}`);
  }
  if (query.yearTo) {
    const ts = Math.floor(new Date(`${query.yearTo}-12-31`).getTime() / 1000);
    wheres.push(`first_release_date <= ${ts}`);
  }
  if (wheres.length === 0) return [];

  // Require enough ratings to be statistically meaningful — otherwise
  // `sort total_rating desc` surfaces obscure games with 1-2 perfect votes
  // ahead of mainstream titles. 10 is a low-but-nonzero floor that keeps
  // small indies in but cuts the long tail of single-vote outliers.
  wheres.push(`total_rating_count > 10`);

  // Standalone-categories filter is applied CLIENT-SIDE — IGDB's where-clause
  // tuple-match `category = (0,4,8,9)` empirically zeroes out otherwise-good
  // discovery queries when combined with genre + rating filters. Filtering in
  // code is reliable and uses the same allowlist as title search.
  const body = `fields ${FIELDS}; where ${wheres.join(" & ")}; sort total_rating desc; limit ${limit * 2};`;
  const games = await igdbFetch<IgdbGame[]>("/games", body);
  return games.filter(isStandaloneCategory).slice(0, limit).map(normalize);
}

async function getById(externalId: string): Promise<MediaItem | null> {
  const id = Number(externalId);
  if (!Number.isFinite(id)) return null;
  const body = `fields ${FIELDS}; where id = ${id};`;
  const games = await igdbFetch<IgdbGame[]>("/games", body);
  const first = games[0];
  return first ? normalize(first) : null;
}

export const igdbAdapter: MediaApiAdapter = {
  searchByTitle,
  searchByQuery,
  getById,
};
