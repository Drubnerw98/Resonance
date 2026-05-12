import { useCallback, useEffect, useState } from "react";
import type { MediaItem, MediaType } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

export type LibraryItemStatus = "consumed" | "watchlist";

export interface LibraryItem {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;
  status: LibraryItemStatus;
  rating: number | null;
  year: number | null;
  createdAt: string;
  /** Canonical metadata from media_cache (poster, description, runtime,
   * genres, external link). Populated by the enrichment pipeline on add /
   * mark-watched / post-import drain. Null when the row hasn't been
   * enriched yet — UI falls back to text-only rendering. */
  media: MediaItem | null;
}

interface ServerLibraryItem {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;
  status: LibraryItemStatus;
  rating: number | null;
  year: number | null;
  createdAt: string;
  /** Server ships the joined media_cache row. Drizzle returns the cache
   * row shape; only `normalizedData` (the MediaItem) is interesting to
   * the client. */
  media: { normalizedData: MediaItem } | null;
}

interface EnrichBatchResult {
  enriched: number;
  attempted: number;
}

interface ListResponse {
  items: ServerLibraryItem[];
}

function normalize(item: ServerLibraryItem): LibraryItem {
  return {
    id: item.id,
    title: item.title,
    mediaType: item.mediaType,
    source: item.source,
    status: item.status,
    rating: item.rating,
    year: item.year,
    createdAt: item.createdAt,
    media: item.media?.normalizedData ?? null,
  };
}

interface ImportResult {
  parsed: number;
  inserted: number;
  duplicates: number;
}

export type ImportSource =
  | "letterboxd"
  | "letterboxd-watchlist"
  | "goodreads"
  | "myanimelist";

export interface UseLibrary {
  status: "loading" | "ready" | "error";
  items: LibraryItem[];
  error: string | null;
  importing: boolean;
  importCsv: (
    source: ImportSource,
    csv: string,
  ) => Promise<ImportResult | null>;
  /** Import owned games from Steam by SteamID, profile URL, or vanity URL.
   * Different shape from importCsv (no file upload), so it's its own method. */
  importSteam: (steamIdOrUrl: string) => Promise<ImportResult | null>;
  add: (input: {
    title: string;
    mediaType: MediaType;
    year?: number;
    rating?: number;
    status?: LibraryItemStatus;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Flip an item between consumed and watchlist. Used by the
   * "Mark consumed" / "Move to watchlist" actions. */
  setItemStatus: (id: string, status: LibraryItemStatus) => Promise<void>;
  /** Set a 1-5 star rating on an item (or null to clear). Promotion from
   * watchlist → consumed triggers AI annotation server-side. */
  setItemRating: (id: string, rating: number | null) => Promise<void>;
  /** Clear every library item, optionally filtered by source. Returns count
   * deleted. */
  clear: (source?: string) => Promise<number>;
  refresh: () => Promise<void>;
  /** After a bulk import (CSV / Steam), pulls posters + metadata for the
   * just-imported rows in 50-at-a-time batches. UI refreshes between
   * batches so rows light up progressively. */
  drainEnrichment: () => Promise<void>;
}

export function useLibrary(): UseLibrary {
  const api = useApi();
  const [status, setStatus] = useState<UseLibrary["status"]>("loading");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api<ListResponse>("/library");
      setItems(res.items.map(normalize));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load library");
    }
  }, [api]);

  /** Drain the un-enriched library rows via the server's batch endpoint.
   * Used by import flows: after a CSV / Steam import returns success, the
   * client kicks this off so posters fill in without blocking the import
   * response itself. Polls until the server reports zero attempted rows
   * (everything already enriched) or a hard cap is hit. */
  const drainEnrichment = useCallback(async () => {
    for (let i = 0; i < 8; i++) {
      try {
        const res = await api<EnrichBatchResult>("/library/enrich-batch", {
          method: "POST",
        });
        if (res.attempted === 0) break;
        // Trickle refreshed rows back to UI so posters appear as they land
        // — without this the page stays bare until the whole drain finishes.
        await refresh();
        if (res.enriched === 0) break;
      } catch {
        break;
      }
    }
  }, [api, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importCsv = useCallback(
    async (source: ImportSource, csv: string): Promise<ImportResult | null> => {
      if (importing) return null;
      setImporting(true);
      setError(null);
      try {
        const res = await api<ImportResult>("/library/import", {
          method: "POST",
          body: { source, csv },
        });
        await refresh();
        // Backfill posters / metadata for the just-imported rows. Fire and
        // forget — the import has already returned; the drain trickles
        // results in over the next few seconds.
        void drainEnrichment();
        return res;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Import failed",
        );
        return null;
      } finally {
        setImporting(false);
      }
    },
    [api, importing, refresh, drainEnrichment],
  );

  const importSteam = useCallback(
    async (steamIdOrUrl: string): Promise<ImportResult | null> => {
      if (importing) return null;
      setImporting(true);
      setError(null);
      try {
        const res = await api<ImportResult>("/library/import-steam", {
          method: "POST",
          body: { steamIdOrUrl },
        });
        await refresh();
        void drainEnrichment();
        return res;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Steam import failed",
        );
        return null;
      } finally {
        setImporting(false);
      }
    },
    [api, importing, refresh, drainEnrichment],
  );

  const add = useCallback(
    async (input: {
      title: string;
      mediaType: MediaType;
      year?: number;
      rating?: number;
      status?: LibraryItemStatus;
    }) => {
      try {
        await api("/library", { method: "POST", body: input });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add");
      }
    },
    [api, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await api(`/library/${id}`, { method: "DELETE" });
      } catch (err) {
        setItems(snapshot);
        setError(err instanceof Error ? err.message : "Failed to remove");
      }
    },
    [api, items],
  );

  const setItemStatus = useCallback(
    async (id: string, status: LibraryItemStatus) => {
      // Optimistic flip — UI moves the item between tabs immediately.
      const snapshot = items;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      try {
        await api(`/library/${id}`, {
          method: "PATCH",
          body: { status },
        });
      } catch (err) {
        setItems(snapshot);
        setError(
          err instanceof Error ? err.message : "Failed to update status",
        );
      }
    },
    [api, items],
  );

  const setItemRating = useCallback(
    async (id: string, rating: number | null) => {
      const snapshot = items;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, rating } : i)),
      );
      try {
        await api(`/library/${id}`, {
          method: "PATCH",
          body: { rating },
        });
      } catch (err) {
        setItems(snapshot);
        setError(
          err instanceof Error ? err.message : "Failed to update rating",
        );
      }
    },
    [api, items],
  );

  const clear = useCallback(
    async (source?: string): Promise<number> => {
      try {
        const path = source
          ? `/library?source=${encodeURIComponent(source)}`
          : "/library";
        const res = await api<{ deleted: number }>(path, { method: "DELETE" });
        await refresh();
        return res.deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clear");
        return 0;
      }
    },
    [api, refresh],
  );

  return {
    status,
    items,
    error,
    importing,
    importCsv,
    importSteam,
    add,
    remove,
    setItemStatus,
    setItemRating,
    clear,
    refresh,
    drainEnrichment,
  };
}
