import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

export interface RecommendationItem {
  id: string;
  batchId: string;
  matchScore: number;
  explanation: string;
  tasteTags: string[];
  status: "pending" | "seen" | "saved" | "skipped" | "rated";
  rating: number | null;
  createdAt: string;
  actedAt: string | null;
  media: { cacheId: string } & MediaItem;
}

interface ListResponse {
  recommendations: RecommendationItem[];
}

interface GenerateResponse extends ListResponse {
  count: number;
  batchId: string | null;
}

export interface UseRecommendations {
  status: "loading" | "ready" | "error";
  recommendations: RecommendationItem[];
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
}

export function useRecommendations(): UseRecommendations {
  const api = useApi();
  const [status, setStatus] = useState<UseRecommendations["status"]>("loading");
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    [],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<ListResponse>("/recommendations");
      setRecommendations(res.recommendations);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api<ListResponse>("/recommendations")
      .then((res) => {
        if (cancelled) return;
        setRecommendations(res.recommendations);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const generate = useCallback(async () => {
    if (isGenerating) return;
    setError(null);
    setIsGenerating(true);
    try {
      const res = await api<GenerateResponse>("/recommendations/generate", {
        method: "POST",
      });
      // Newly generated recs come first; keep older ones below.
      setRecommendations((prev) => {
        const newIds = new Set(res.recommendations.map((r) => r.id));
        return [
          ...res.recommendations,
          ...prev.filter((r) => !newIds.has(r.id)),
        ];
      });
      setStatus("ready");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to generate";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [api, isGenerating]);

  const clear = useCallback(async () => {
    try {
      await api("/recommendations", { method: "DELETE" });
      setRecommendations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    }
  }, [api]);

  return {
    status,
    recommendations,
    isGenerating,
    error,
    generate,
    refresh,
    clear,
  };
}
