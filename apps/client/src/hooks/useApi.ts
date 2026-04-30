import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";
import { apiFetch, type ApiFetchOptions } from "../lib/api.ts";

/**
 * Returns a stable apiFetch wrapper that attaches the current Clerk session
 * token. Components/hooks call this once and reuse the returned function.
 */
export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    <T>(path: string, options: ApiFetchOptions = {}) =>
      apiFetch<T>(path, { ...options, getToken: () => getToken() }),
    [getToken],
  );
}
