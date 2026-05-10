import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { OnboardingMessage } from "@resonance/shared";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { onboardingSystemPrompt } from "./prompts/onboarding.js";
import { StreamFilter } from "./streaming.js";
import { aiTimeoutSignal } from "./aiTimeout.js";

export interface OnboardingStreamChunk {
  /** Cleaned text safe to display (analysis + ready tags stripped). */
  text: string;
  /** True on the chunk where <ready/> was first detected. */
  ready: boolean;
}

export interface OnboardingStreamResult {
  /**
   * Async iterable of chunks the route handler forwards to the client.
   */
  chunks: AsyncIterable<OnboardingStreamChunk>;
  /**
   * Resolves once the stream has ended. Yields the full raw assistant text
   * (including <analysis> blocks and <ready/>) for persistence, plus whether
   * <ready/> was seen at any point.
   */
  done: Promise<{ raw: string; ready: boolean }>;
}

/**
 * Stream a Claude response for the next onboarding turn. The caller has
 * already appended the user message to the transcript; we send the full
 * history to the model and yield filtered chunks as they arrive.
 */
export function streamOnboardingReply(
  history: OnboardingMessage[],
): OnboardingStreamResult {
  const client = getAnthropic();
  const filter = new StreamFilter();

  let resolveDone!: (v: { raw: string; ready: boolean }) => void;
  let rejectDone!: (err: unknown) => void;
  const done = new Promise<{ raw: string; ready: boolean }>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  async function* generate(): AsyncIterable<OnboardingStreamChunk> {
    let raw = "";
    try {
      // Prompt-caching: mark the last message in the history so subsequent
      // turns hit the cache for everything that came before. Once the
      // cumulative prefix passes Sonnet 4.6's ~2K-token minimum (around turn
      // 3-4), each new request reads the system prompt + prior turns from
      // cache at ~10% of normal input cost.
      const messages = history.map((m, i) => {
        if (i === history.length - 1) {
          return {
            role: m.role,
            content: [
              {
                type: "text" as const,
                text: m.content,
                cache_control: { type: "ephemeral" as const },
              },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

      const stream = client.messages.stream({
        model: ONBOARDING_MODEL,
        max_tokens: 2048,
        system: onboardingSystemPrompt(),
        messages,
      }, { signal: aiTimeoutSignal() });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const delta = event.delta.text;
          raw += delta;
          const { text, readySignaled } = filter.push(delta);
          if (text || readySignaled) {
            yield { text, ready: readySignaled };
          }
        }
      }

      const tail = filter.flush();
      if (tail) {
        yield { text: tail, ready: false };
      }

      resolveDone({ raw, ready: filter.isReady });
    } catch (err) {
      const wrapped = mapAbortError(err);
      rejectDone(wrapped);
      throw wrapped;
    }
  }

  return { chunks: generate(), done };
}

function mapAbortError(err: unknown): unknown {
  const isAbort =
    err instanceof APIUserAbortError ||
    (err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError"));
  if (!isAbort) return err;
  return Object.assign(new Error("AI request timed out"), { status: 504 });
}
