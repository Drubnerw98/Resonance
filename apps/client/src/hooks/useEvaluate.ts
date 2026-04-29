import { useCallback, useState } from "react";
import type { MediaItem, MediaType } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

export interface EvaluateMatch {
  mediaCacheId: string;
  item: MediaItem;
}

export interface EvaluateStatus {
  inLibrary: boolean;
  inSavedRecs: boolean;
  rejectedBefore: boolean;
  inDislikedTitles: boolean;
  previouslyRecommended: boolean;
}

export interface Verdict {
  matchScore: number;
  verdict: string;
  tasteTags: string[];
}

export interface VerdictResult {
  candidate: EvaluateMatch;
  verdict: Verdict;
  status: EvaluateStatus;
}

export interface UseEvaluate {
  searchStatus: "idle" | "searching" | "ready" | "error";
  matches: EvaluateMatch[];
  search: (input: { title: string; mediaType: MediaType }) => Promise<void>;
  scoreStatus: "idle" | "scoring" | "ready" | "error";
  result: VerdictResult | null;
  score: (mediaCacheId: string) => Promise<void>;
  reset: () => void;
  error: string | null;
}

export function useEvaluate(): UseEvaluate {
  const api = useApi();
  const [searchStatus, setSearchStatus] =
    useState<UseEvaluate["searchStatus"]>("idle");
  const [matches, setMatches] = useState<EvaluateMatch[]>([]);
  const [scoreStatus, setScoreStatus] =
    useState<UseEvaluate["scoreStatus"]>("idle");
  const [result, setResult] = useState<VerdictResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async ({ title, mediaType }: { title: string; mediaType: MediaType }) => {
      setSearchStatus("searching");
      setError(null);
      // Starting a new search invalidates the prior verdict — otherwise the
      // page would show a stale verdict next to a newer match list.
      setResult(null);
      setScoreStatus("idle");
      try {
        const res = await api<{ matches: EvaluateMatch[] }>("/evaluate/search", {
          method: "POST",
          body: { title, mediaType },
        });
        setMatches(res.matches);
        setSearchStatus("ready");
      } catch (err) {
        setSearchStatus("error");
        setError(toMessage(err, "Search failed"));
      }
    },
    [api],
  );

  const score = useCallback(
    async (mediaCacheId: string) => {
      setScoreStatus("scoring");
      setError(null);
      try {
        const res = await api<VerdictResult>("/evaluate/score", {
          method: "POST",
          body: { mediaCacheId },
        });
        setResult(res);
        setScoreStatus("ready");
      } catch (err) {
        setScoreStatus("error");
        setError(toMessage(err, "Verdict failed"));
      }
    },
    [api],
  );

  const reset = useCallback(() => {
    setMatches([]);
    setResult(null);
    setSearchStatus("idle");
    setScoreStatus("idle");
    setError(null);
  }, []);

  return {
    searchStatus,
    matches,
    search,
    scoreStatus,
    result,
    score,
    reset,
    error,
  };
}

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return fallback;
}
