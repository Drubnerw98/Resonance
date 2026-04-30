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
