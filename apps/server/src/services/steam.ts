import type { NewLibraryItemRow } from "../db/schema.js";

/**
 * Steam Web API integration for library import.
 *
 * Scope (intentional):
 *   - Owned games only — Valve deprecated the public wishlist JSON
 *     endpoint in 2024; the replacement requires user OAuth tokens which
 *     would be a separate feature.
 *   - Status = "consumed" with no rating. Playtime is intentionally NOT
 *     mapped to a rating — it's noisy signal (2 hours could mean "loved
 *     it" or "bounced off after the tutorial"). Users can rate manually
 *     in their library if they want.
 *   - No year — Steam's GetOwnedGames doesn't include release year, and
 *     per-game appdetails calls are rate-limited (~1/sec) which would
 *     turn a 200-game import into a 4-minute wait.
 */

const STEAM_API = "https://api.steampowered.com";

interface SteamGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
}

interface OwnedGamesResponse {
  response?: {
    game_count?: number;
    games?: SteamGame[];
  };
}

interface VanityResolveResponse {
  response?: {
    steamid?: string;
    success?: number;
    message?: string;
  };
}

/**
 * Accept a 64-bit SteamID, a /profiles/ URL, or a vanity name / /id/ URL.
 * Resolves vanity inputs via ResolveVanityURL. Throws with a helpful message
 * if the input doesn't look like any of those.
 */
export async function resolveSteamId(input: string): Promise<string> {
  const trimmed = input.trim();

  // /profiles/76561... URL (anywhere in the string).
  const profileMatch = trimmed.match(/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1]!;

  // Bare 64-bit ID — Steam IDs are 17 digits starting with 7656.
  if (/^\d{17}$/.test(trimmed)) return trimmed;

  // /id/<vanity> URL — extract the vanity slug, fall through to the
  // resolver. If the input was just a bare vanity name (no URL), use it
  // as the slug directly.
  const vanityFromUrl = trimmed.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  const vanity = vanityFromUrl ? vanityFromUrl[1]! : trimmed;

  // Reject obvious non-vanity inputs before hitting the API.
  if (/[^A-Za-z0-9_-]/.test(vanity)) {
    throw new Error(
      "Couldn't recognize that as a Steam profile. Use your 64-bit Steam ID, your /profiles/ URL, or your /id/<name> URL.",
    );
  }

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error("STEAM_API_KEY is not set");

  const url = new URL(`${STEAM_API}/ISteamUser/ResolveVanityURL/v0001/`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("vanityurl", vanity);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Steam vanity URL lookup failed: ${res.status} ${res.statusText}`,
    );
  }
  const json = (await res.json()) as VanityResolveResponse;
  if (json.response?.success === 1 && json.response.steamid) {
    return json.response.steamid;
  }
  throw new Error(
    `Couldn't find a Steam profile for "${vanity}". Check spelling, or use your 64-bit Steam ID or /profiles/ URL.`,
  );
}

/**
 * Fetch the user's owned-games list and shape it into library item rows.
 * Free games included (some users own free games and want them deduped).
 * Throws a clear error when the profile or game list is private.
 */
export async function fetchOwnedGames(
  steamId: string,
): Promise<NewLibraryItemRow[]> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error("STEAM_API_KEY is not set");

  const url = new URL(`${STEAM_API}/IPlayerService/GetOwnedGames/v0001/`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Steam GetOwnedGames failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as OwnedGamesResponse;
  const games = json.response?.games ?? [];

  // Steam returns an empty `response: {}` when the profile or game-details
  // privacy is set to private. Surface a helpful message so users know to
  // flip the privacy toggle.
  if (
    games.length === 0 &&
    (json.response?.game_count ?? 0) === 0 &&
    !("game_count" in (json.response ?? {}))
  ) {
    throw new Error(
      "Steam returned no data — your profile or game-details privacy is likely private. " +
        "On Steam: Profile → Edit Profile → Privacy Settings → set Game details to Public.",
    );
  }

  return games
    .filter((g): g is SteamGame & { name: string } => Boolean(g.name))
    .map((g) => ({
      userId: "",
      title: g.name,
      mediaType: "game" as const,
      source: "steam",
      // Owned = consumed (we have ownership signal). Rating left null —
      // users rate manually in the library if they care.
      status: "consumed" as const,
      rating: null,
      year: null,
    }));
}
