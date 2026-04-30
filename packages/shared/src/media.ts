export type MediaSource = "tmdb" | "igdb" | "jikan" | "openlibrary";

export type MediaType = "movie" | "tv" | "anime" | "manga" | "game" | "book";

export interface MediaItem {
  externalId: string;
  source: MediaSource;
  mediaType: MediaType;
  title: string;
  description: string;
  imageUrl: string | null;
  rating: number | null;
  year: number | null;
  /** Length in minutes. For movies: total runtime. For TV/anime: typical
   * episode runtime. Null for formats without a meaningful runtime (games,
   * books, manga) and for items where the source didn't return one. Currently
   * populated only for TMDB movies/TV — the rest stay null until we add
   * per-format normalization. Optional to keep media_cache rows persisted
   * before this field existed parsing without migration. */
  runtime?: number | null;
  genres: string[];
  externalUrl: string;
  metadata: Record<string, unknown>;
}

export interface MediaSearchQuery {
  mediaType: MediaType;
  genres?: string[];
  keywords?: string[];
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
}
