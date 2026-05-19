import { useCallback, useEffect, useState } from "react";
import { useApi } from "./useApi.ts";

export interface McpToken {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ListResponse {
  tokens: McpToken[];
}

interface MintResponse {
  token: McpToken;
  /** Raw token. Server returns this exactly once at mint time; we surface
   * it to the user immediately and intentionally drop it from state on
   * dismissal. Never persisted client-side. */
  rawToken: string;
}

export interface UseMcpTokens {
  status: "loading" | "ready" | "error";
  tokens: McpToken[];
  error: string | null;
  refresh: () => Promise<void>;
  mint: (name: string) => Promise<MintResponse>;
  revoke: (id: string) => Promise<void>;
}

export function useMcpTokens(): UseMcpTokens {
  const api = useApi();
  const [status, setStatus] = useState<UseMcpTokens["status"]>("loading");
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<ListResponse>("/mcp-tokens");
      setTokens(res.tokens);
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mint = useCallback(
    async (name: string): Promise<MintResponse> => {
      const res = await api<MintResponse>("/mcp-tokens", {
        method: "POST",
        body: { name },
      });
      // Prepend the new token so the list reflects it immediately without a
      // round-trip. The server's list-route returns the same ordering
      // (newest-first), so this stays consistent post-refresh.
      setTokens((prev) => [res.token, ...prev]);
      return res;
    },
    [api],
  );

  const revoke = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update — mark the row revoked locally, then ask the
      // server. The 200 response has { ok: true, revoked: bool }; whether
      // a live row was actually flipped or not, the UI shape is the same.
      const now = new Date().toISOString();
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, revokedAt: now } : t)),
      );
      try {
        await api(`/mcp-tokens/${id}`, { method: "DELETE" });
      } catch (err) {
        // Roll back on failure.
        await refresh();
        throw err;
      }
    },
    [api, refresh],
  );

  return { status, tokens, error, refresh, mint, revoke };
}
