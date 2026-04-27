/**
 * Token-bucket rate limiter. Each bucket has a capacity and a refill rate
 * expressed as `capacity` tokens per `intervalMs` milliseconds. Callers
 * `await acquire()` before sending a request; if no tokens are available the
 * call sleeps until one is.
 *
 * Used by the media adapters to respect each provider's documented limits:
 *   - TMDB:  40 req / 10 s  → capacity 40, intervalMs 10_000
 *   - IGDB:   4 req /  1 s  → capacity  4, intervalMs  1_000
 *   - Jikan:  3 req /  1 s  → capacity  3, intervalMs  1_000
 *
 * Per-process only — survives in memory, not across multiple server instances.
 * For a single dev box and a single Vercel function instance that's fine; if
 * we ever scale horizontally this becomes a Redis token bucket.
 */
export interface RateLimiter {
  acquire(): Promise<void>;
}

export function createTokenBucket(opts: {
  capacity: number;
  intervalMs: number;
}): RateLimiter {
  const { capacity, intervalMs } = opts;
  const refillPerMs = capacity / intervalMs;

  let tokens = capacity;
  let lastRefill = Date.now();
  // FIFO of resolvers waiting for a token, so requests don't get reordered.
  const waiting: Array<() => void> = [];

  function refill(): void {
    const now = Date.now();
    const elapsed = now - lastRefill;
    if (elapsed <= 0) return;
    tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
    lastRefill = now;
  }

  function tryDrainQueue(): void {
    refill();
    while (waiting.length > 0 && tokens >= 1) {
      tokens -= 1;
      const resolve = waiting.shift()!;
      resolve();
    }
    if (waiting.length > 0) {
      // Schedule another check at the next predicted token availability.
      const msUntilNext = (1 - tokens) / refillPerMs;
      setTimeout(tryDrainQueue, Math.max(1, Math.ceil(msUntilNext)));
    }
  }

  return {
    acquire(): Promise<void> {
      refill();
      if (waiting.length === 0 && tokens >= 1) {
        tokens -= 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        waiting.push(resolve);
        tryDrainQueue();
      });
    },
  };
}
