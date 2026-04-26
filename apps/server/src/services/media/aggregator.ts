import type { MediaItem, MediaSearchQuery, MediaType } from "@resonance/shared";

export interface MediaApiAdapter {
  searchByTitle(title: string): Promise<MediaItem[]>;
  searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]>;
  getById(externalId: string): Promise<MediaItem | null>;
}

// Routes requests to the right adapter based on media type and normalizes
// responses into MediaItem.
export function getAdapterForType(_type: MediaType): MediaApiAdapter {
  throw new Error("not implemented");
}
