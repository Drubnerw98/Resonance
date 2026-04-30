/**
 * Per-user daily rate limits on AI-bound endpoints. Prevents a single
 * authenticated user from burning through the Anthropic budget by hammering
 * onboarding / generation / evaluate.
 *
 * Scope: in-memory, single-process. Matches the rest of our infrastructure
 * (the job tracker is the same shape). If we ever go multi-instance the
 * counters would need to move to Postgres or Redis.
 *
 * Reset: midnight UTC. Buckets older than their resetAt get pruned hourly so
 * the Map doesn't grow without bound.
 */

const LIMITS = {
  "onboarding.message": 100,
  "recommendations.generate": 25,
  "evaluate.score": 100,
  "discover.refresh": 20,
  "profile.refine": 10,
  "watchlist.decide": 50,
} as const satisfies Record<string, number>;

export type RateLimitKind = keyof typeof LIMITS;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function nextUtcMidnight(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * Increment the user's counter for the given kind. Throws a 429-coded error
 * (status: 429 attached to the Error) if they're at or over the daily cap.
 *
 * Call this BEFORE the expensive operation, not after — we want to refuse
 * the request, not let it run and then fail to record.
 */
export function checkRateLimit(userId: string, kind: RateLimitKind): void {
  const limit = LIMITS[kind];
  const key = `${userId}:${kind}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: nextUtcMidnight() };
  }
  if (bucket.count >= limit) {
    const err: Error & { status?: number } = new Error(
      `Daily limit reached for ${kind} (${limit}/day). Resets at midnight UTC.`,
    );
    err.status = 429;
    throw err;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
}

/** Read the user's current count + limit for a kind. Used for diagnostics
 * (e.g. surfacing "you have N left today" in the UI later if we want). */
export function getRateLimitStatus(
  userId: string,
  kind: RateLimitKind,
): { count: number; limit: number; resetAt: number } {
  const limit = LIMITS[kind];
  const key = `${userId}:${kind}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { count: 0, limit, resetAt: nextUtcMidnight() };
  }
  return { count: bucket.count, limit, resetAt: bucket.resetAt };
}

// Hourly cleanup — drop buckets that expired. .unref() so the timer doesn't
// keep the process alive on its own.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  },
  60 * 60 * 1000,
).unref();
