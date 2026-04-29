import { useCallback, useEffect, useState } from "react";
import type { MediaType } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

export interface LibraryItem {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;
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

export type ImportSource = "letterboxd" | "goodreads";

export interface UseLibrary {
  status: "loading" | "ready" | "error";
  items: LibraryItem[];
  error: string | null;
  importing: boolean;
  importCsv: (source: ImportSource, csv: string) => Promise<ImportResult | null>;
  add: (input: {
    title: string;
    mediaType: MediaType;
    year?: number;
    rating?: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
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

  const add = useCallback(
    async (input: {
      title: string;
      mediaType: MediaType;
      year?: number;
      rating?: number;
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
    add,
    remove,
    clear,
    refresh,
  };
}
