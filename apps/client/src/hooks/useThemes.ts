import { useCallback, useEffect, useState } from "react";
import type { DiscoveryTheme } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

interface ThemesResponse {
  themes: DiscoveryTheme[];
  generatedAt: string;
}

export interface UseThemes {
  status: "loading" | "ready" | "error";
  themes: DiscoveryTheme[];
  generatedAt: string | null;
  error: string | null;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

export function useThemes(): UseThemes {
  const api = useApi();
  const [status, setStatus] = useState<UseThemes["status"]>("loading");
  const [themes, setThemes] = useState<DiscoveryTheme[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<ThemesResponse>("/discover/themes")
      .then((res) => {
        if (cancelled) return;
        setThemes(res.themes);
        setGeneratedAt(res.generatedAt);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(toMessage(err, "Failed to load themes"));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await api<ThemesResponse>("/discover/themes/refresh", {
        method: "POST",
      });
      setThemes(res.themes);
      setGeneratedAt(res.generatedAt);
      setStatus("ready");
    } catch (err) {
      setError(toMessage(err, "Failed to refresh"));
    } finally {
      setIsRefreshing(false);
    }
  }, [api, isRefreshing]);

  return { status, themes, generatedAt, error, isRefreshing, refresh };
}

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return fallback;
}
