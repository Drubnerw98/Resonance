import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OnboardingMessage } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { postSSE } from "../lib/sse.ts";

interface SessionResponse {
  id: string;
  status: "active" | "completed" | "abandoned";
  turnCount: number;
  ready: boolean;
  messages: OnboardingMessage[];
}

interface CompleteResponse {
  sessionId: string;
  sessionStatus: "completed";
  profile: unknown;
  version: number;
  alreadyExtracted: boolean;
  /** True when this completion created a brand-new profile (vs. evolving an
   * existing one via continued onboarding). The server auto-fires the first
   * recommendation batch in this case so the user lands on /recommendations
   * with a job already running. */
  firstProfile?: boolean;
}

export interface UseOnboarding {
  sessionStatus: "loading" | "active" | "completed" | "abandoned" | "error";
  messages: OnboardingMessage[];
  /** Tokens accumulated for the in-flight assistant reply. Empty when idle. */
  streamingText: string;
  isSending: boolean;
  /** True while POST /complete is running (extraction takes a few seconds). */
  isExtracting: boolean;
  ready: boolean;
  error: string | null;
  send: (content: string) => Promise<void>;
  /** Triggers extraction; resolves with the completion response so callers
   * can branch on `firstProfile` for navigation. Throws on failure. */
  complete: () => Promise<CompleteResponse>;
}

export function useOnboarding(): UseOnboarding {
  const api = useApi();
  const { getToken } = useAuth();

  const [sessionStatus, setSessionStatus] =
    useState<UseOnboarding["sessionStatus"]>("loading");
  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamingRef = useRef("");

  // Hydrate on mount.
  useEffect(() => {
    let cancelled = false;
    api<SessionResponse>("/onboarding/session")
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages);
        setSessionStatus(res.status);
        setReady(res.ready);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSessionStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load session");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const send = useCallback(
    async (content: string) => {
      if (isSending) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);
      setIsSending(true);
      streamingRef.current = "";
      setStreamingText("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      try {
        const token = await getToken();
        await postSSE("/onboarding/message", { content: trimmed }, token, {
          onEvent: (event, data) => {
            if (event === "token" && data && typeof data === "object") {
              const text = (data as { text?: string }).text ?? "";
              streamingRef.current += text;
              setStreamingText(streamingRef.current);
            } else if (event === "ready") {
              setReady(true);
            } else if (event === "error") {
              const msg =
                data && typeof data === "object" && "message" in data
                  ? String((data as { message: unknown }).message)
                  : "stream error";
              setError(msg);
            }
          },
        });

        const finalText = streamingRef.current;
        if (finalText) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: finalText },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send");
      } finally {
        streamingRef.current = "";
        setStreamingText("");
        setIsSending(false);
      }
    },
    [getToken, isSending],
  );

  const complete = useCallback(async (): Promise<CompleteResponse> => {
    setError(null);
    setIsExtracting(true);
    try {
      const res = await api<CompleteResponse>("/onboarding/complete", {
        method: "POST",
      });
      setSessionStatus("completed");
      return res;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to extract profile";
      setError(msg);
      throw err;
    } finally {
      setIsExtracting(false);
    }
  }, [api]);

  return {
    sessionStatus,
    messages,
    streamingText,
    isSending,
    isExtracting,
    ready,
    error,
    send,
    complete,
  };
}
