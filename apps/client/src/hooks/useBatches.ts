import { useCallback, useEffect, useState } from "react";
import { useApi } from "./useApi.ts";

export interface BatchSummary {
  id: string;
  prompt: string | null;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  count: number;
  /** Per-format breakdown: { movie: 3, book: 2, ... }. Sparse — only
   * formats with at least one rec appear. */
  formatCounts: Record<string, number>;
  /** Top 3 most-common taste tags across the batch's recs. Used as the
   * fallback smart label when the user hasn't set a name. */
  topTags: string[];
  /** Up to 4 cover image URLs from the batch's highest-scoring recs.
   * Rendered as small thumbnails on the batches page for visual identity. */
  coverUrls: string[];
}

interface BatchesResponse {
  batches: BatchSummary[];
}

export interface UseBatches {
  status: "loading" | "ready" | "error";
  batches: BatchSummary[];
  error: string | null;
  refresh: () => Promise<void>;
  rename: (id: string, name: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useBatches(): UseBatches {
  const api = useApi();
  const [status, setStatus] = useState<UseBatches["status"]>("loading");
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<BatchesResponse>("/recommendations/batches");
      setBatches(res.batches);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load batches");
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rename = useCallback(
    async (id: string, name: string | null) => {
      // Optimistic update.
      setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
      try {
        await api(`/recommendations/batches/${id}`, {
          method: "PATCH",
          body: { name },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename");
        // Reload to recover correct state.
        void refresh();
      }
    },
    [api, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const snapshot = batches;
      setBatches((prev) => prev.filter((b) => b.id !== id));
      try {
        await api(`/recommendations/batches/${id}`, { method: "DELETE" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
        setBatches(snapshot);
      }
    },
    [api, batches],
  );

  return { status, batches, error, refresh, rename, remove };
}
