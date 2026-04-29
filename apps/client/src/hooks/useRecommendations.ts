import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

export interface BatchInfo {
  id: string;
  prompt: string | null;
  name: string | null;
  createdAt: string;
}

export interface RecommendationItem {
  id: string;
  batchId: string;
  batch: BatchInfo;
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

type JobStatus = "pending" | "running" | "completed" | "failed";

interface JobStartResponse {
  jobId: string;
  status: JobStatus;
}

interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  error?: string;
  count?: number;
  batchId?: string | null;
  recommendations?: RecommendationItem[];
}

const POLL_INTERVAL_MS = 2_500;

export interface UseRecommendations {
  status: "loading" | "ready" | "error";
  recommendations: RecommendationItem[];
  isGenerating: boolean;
  rescoringIds: ReadonlySet<string>;
  error: string | null;
  generate: (prompt?: string) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
  setFeedback: (
    recId: string,
    status: RecommendationItem["status"],
    rating?: number | null,
  ) => Promise<void>;
  rescore: (recId: string) => Promise<void>;
}

export function useRecommendations(): UseRecommendations {
  const api = useApi();
  const [status, setStatus] = useState<UseRecommendations["status"]>("loading");
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    [],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [rescoringIds, setRescoringIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);

  // Track the active job ID so a follow-up poll loop knows what to ask about.
  // Stored in a ref so polling doesn't trigger re-renders or close over stale
  // state.
  const activeJobIdRef = useRef<string | null>(null);
  // Cancel flag so unmount kills the poll loop.
  const cancelledRef = useRef(false);

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

  /**
   * Polls /generate/:jobId until the job finishes. On success applies the
   * fresh recs to local state. Used by both `generate` and the mount-time
   * resume.
   */
  const pollJob = useCallback(
    async (jobId: string) => {
      activeJobIdRef.current = jobId;
      setIsGenerating(true);

      while (!cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelledRef.current) break;

        let res: JobStatusResponse;
        try {
          res = await api<JobStatusResponse>(
            `/recommendations/generate/${jobId}`,
          );
        } catch (err) {
          setError(
            err instanceof ApiError
              ? `${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : "Polling failed",
          );
          break;
        }

        if (res.status === "completed") {
          if (res.recommendations) {
            const newIds = new Set(res.recommendations.map((r) => r.id));
            setRecommendations((prev) => [
              ...res.recommendations!,
              ...prev.filter((r) => !newIds.has(r.id)),
            ]);
            setStatus("ready");
          }
          break;
        }
        if (res.status === "failed") {
          setError(res.error ?? "Generation failed");
          break;
        }
      }

      activeJobIdRef.current = null;
      setIsGenerating(false);
    },
    [api],
  );

  // Mount: hydrate the rec list, AND check for an active job to resume polling.
  // refresh() handles the GET; we just chain the active-job check after it.
  // cancelledRef guards against state updates after unmount.
  useEffect(() => {
    cancelledRef.current = false;

    void (async () => {
      await refresh();
      if (cancelledRef.current) return;

      // Resume polling if there's a running generate job (e.g., the user
      // reloaded mid-generation). Endpoint returns { jobId: null } when none.
      try {
        const active = await api<{ jobId: string | null; status?: JobStatus }>(
          "/recommendations/active-job",
        );
        if (!cancelledRef.current && active.jobId) {
          void pollJob(active.jobId);
        }
      } catch {
        // Network blip — silently ignore; user can click Generate to retry.
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [api, pollJob, refresh]);

  const generate = useCallback(
    async (prompt?: string) => {
      if (isGenerating) return;
      setError(null);
      try {
        const res = await api<JobStartResponse>("/recommendations/generate", {
          method: "POST",
          body: prompt && prompt.trim() ? { prompt: prompt.trim() } : {},
        });
        void pollJob(res.jobId);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to start generation",
        );
      }
    },
    [api, isGenerating, pollJob],
  );

  const clear = useCallback(async () => {
    try {
      await api("/recommendations", { method: "DELETE" });
      setRecommendations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    }
  }, [api]);

  const setFeedback = useCallback(
    async (
      recId: string,
      status: RecommendationItem["status"],
      rating?: number | null,
    ) => {
      let snapshot: RecommendationItem[] = [];
      setRecommendations((prev) => {
        snapshot = prev;
        return prev.map((r) =>
          r.id === recId
            ? {
                ...r,
                status,
                rating: rating ?? r.rating,
                actedAt: new Date().toISOString(),
              }
            : r,
        );
      });
      try {
        await api(`/recommendations/${recId}/feedback`, {
          method: "PATCH",
          body: { status, ...(rating != null ? { rating } : {}) },
        });
      } catch (err) {
        setRecommendations(snapshot);
        setError(err instanceof Error ? err.message : "Failed to save feedback");
      }
    },
    [api],
  );

  const rescore = useCallback(
    async (recId: string) => {
      if (rescoringIds.has(recId)) return;
      setRescoringIds((prev) => {
        const next = new Set(prev);
        next.add(recId);
        return next;
      });
      try {
        const res = await api<{ recommendation: RecommendationItem }>(
          `/recommendations/${recId}/rescore`,
          { method: "POST" },
        );
        setRecommendations((prev) =>
          prev.map((r) => (r.id === recId ? res.recommendation : r)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rescore");
      } finally {
        setRescoringIds((prev) => {
          const next = new Set(prev);
          next.delete(recId);
          return next;
        });
      }
    },
    [api, rescoringIds],
  );

  return {
    status,
    recommendations,
    isGenerating,
    rescoringIds,
    error,
    generate,
    refresh,
    clear,
    setFeedback,
    rescore,
  };
}
