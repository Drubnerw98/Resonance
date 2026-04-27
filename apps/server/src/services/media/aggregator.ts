import type { MediaItem, MediaSearchQuery, MediaType } from "@resonance/shared";
import { tmdbAdapter } from "./tmdb.js";
import { igdbAdapter } from "./igdb.js";
import { jikanAdapter } from "./jikan.js";
import { openLibraryAdapter } from "./openlibrary.js";

export interface MediaApiAdapter {
  searchByTitle(title: string): Promise<MediaItem[]>;
  searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]>;
  getById(externalId: string): Promise<MediaItem | null>;
}

/**
 * Routes a media type to the adapter that owns it. Each adapter is the source
 * of truth for its own external API + rate limit + data normalization.
 *
 * | Media type   | Adapter      | Source         |
 * | ------------ | ------------ | -------------- |
 * | movie, tv    | tmdbAdapter  | TMDB           |
 * | game         | igdbAdapter  | IGDB (+Twitch) |
 * | anime, manga | jikanAdapter | Jikan          |
 * | book         | openLibrary  | Open Library   |
 */
export function getAdapterForType(mediaType: MediaType): MediaApiAdapter {
  switch (mediaType) {
    case "movie":
    case "tv":
      return tmdbAdapter;
    case "game":
      return igdbAdapter;
    case "anime":
    case "manga":
      return jikanAdapter;
    case "book":
      return openLibraryAdapter;
  }
}
