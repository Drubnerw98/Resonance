import { useCallback, useState } from "react";
import type { MediaType } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";
import type { LibraryItem } from "./useLibrary.ts";

export interface WatchlistPick {
  libraryItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  source: string;
  rank: number;
  explanation: string;
}

interface DecideResponse {
  picks: WatchlistPick[];
}

export interface UseWatchlistDecide {
  status: "idle" | "loading" | "ready" | "error";
  picks: WatchlistPick[];
  prompt: string | null;
  error: string | null;
  decide: (prompt: string) => Promise<void>;
  /** Random fallback — no AI, no prompt. Pick one item uniformly from the
   * provided watchlist. Used when none of the mood prompts feel right. */
  pickRandom: (items: LibraryItem[]) => void;
  reset: () => void;
}

/**
 * Submits a mood prompt to /api/watchlist/decide and holds the ranked picks.
 *
 * Separated from useLibrary because (a) it doesn't read the watchlist itself
 * — that comes from useLibrary — and (b) the AI call is expensive and rate-
 * limited; the page mounts useLibrary unconditionally but only fires this
 * hook on submit.
 */
export function useWatchlistDecide(): UseWatchlistDecide {
  const api = useApi();
  const [status, setStatus] = useState<UseWatchlistDecide["status"]>("idle");
  const [picks, setPicks] = useState<WatchlistPick[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      setStatus("loading");
      setPrompt(trimmed);
      setError(null);
      try {
        const res = await api<DecideResponse>("/watchlist/decide", {
          method: "POST",
          body: { prompt: trimmed },
        });
        setPicks(res.picks);
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to decide",
        );
      }
    },
    [api],
  );

  const pickRandom = useCallback((items: LibraryItem[]) => {
    if (items.length === 0) return;
    const choice = items[Math.floor(Math.random() * items.length)]!;
    setPrompt("Pick for me");
    setPicks([
      {
        libraryItemId: choice.id,
        title: choice.title,
        mediaType: choice.mediaType,
        year: choice.year,
        source: choice.source,
        rank: 1,
        explanation: "Random pick from your watchlist.",
      },
    ]);
    setStatus("ready");
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setPicks([]);
    setPrompt(null);
    setError(null);
  }, []);

  return { status, picks, prompt, error, decide, pickRandom, reset };
}
