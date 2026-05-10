import { APIUserAbortError } from "@anthropic-ai/sdk";

/**
 * Default upstream timeout for Anthropic calls. The model's own SLA puts
 * `messages.parse` and `messages.stream` well under this; anything past 90s
 * is almost certainly a network hang or a stuck connection. We'd rather
 * surface 504 to the client than have the request occupy a worker forever.
 */
export const AI_TIMEOUT_MS = 90_000;

export function aiTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(AI_TIMEOUT_MS);
}

/**
 * Wrap an Anthropic call so any abort/timeout raised by the SDK or the
 * underlying fetch surfaces as a status-coded 504 error the global handler
 * can map to the right HTTP code.
 */
export async function withAiTimeout<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAbortError(err)) {
      const wrapped: Error & { status: number } = Object.assign(
        new Error("AI request timed out"),
        { status: 504 },
      );
      throw wrapped;
    }
    throw err;
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return true;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  }
  return false;
}
