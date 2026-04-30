import { useCallback, useEffect, useState } from "react";
import type { MediaType } from "@resonance/shared";
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
}

interface ListResponse {
  items: LibraryItem[];
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
  /** Clear every library item, optionally filtered by source. Returns count
   * deleted. */
  clear: (source?: string) => Promise<number>;
  refresh: () => Promise<void>;
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
      setItems(res.items);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load library");
    }
  }, [api]);

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
    [api, importing, refresh],
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
    [api, importing, refresh],
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
    clear,
    refresh,
  };
}
