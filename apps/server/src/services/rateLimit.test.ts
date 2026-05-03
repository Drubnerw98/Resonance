import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getRateLimitStatus } from "./rateLimit.js";

// The per-user daily rate limit is the only thing standing between a single
// authenticated user and the Anthropic budget. These tests pin three things
// that are easy to regress: per-kind / per-user isolation, the at-limit 429,
// and the midnight-UTC reset.

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Pin time to 2026-05-03 12:00 UTC so we can advance it deterministically.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the per-kind daily cap, then throws 429", () => {
    const userId = "user-A";
    // profile.refine has the lowest cap (10/day) — keep this test tight.
    for (let i = 0; i < 10; i++) {
      expect(() => checkRateLimit(userId, "profile.refine")).not.toThrow();
    }
    expect(() => checkRateLimit(userId, "profile.refine")).toThrow(
      /Daily limit reached/,
    );
    try {
      checkRateLimit(userId, "profile.refine");
    } catch (err) {
      expect((err as { status?: number }).status).toBe(429);
    }
  });

  it("isolates buckets per user", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("user-isolation-A", "profile.refine");
    }
    // user-A is now at the cap; user-B should still be allowed.
    expect(() =>
      checkRateLimit("user-isolation-B", "profile.refine"),
    ).not.toThrow();
    expect(getRateLimitStatus("user-isolation-B", "profile.refine").count).toBe(
      1,
    );
  });

  it("isolates buckets per kind", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("user-C", "profile.refine");
    }
    // profile.refine is full; another kind for the same user is independent.
    expect(() =>
      checkRateLimit("user-C", "recommendations.generate"),
    ).not.toThrow();
  });

  it("resets exactly at midnight UTC", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("user-D", "profile.refine");
    }
    expect(() => checkRateLimit("user-D", "profile.refine")).toThrow();

    // One millisecond before midnight UTC: still over the cap.
    vi.setSystemTime(new Date("2026-05-03T23:59:59.999Z"));
    expect(() => checkRateLimit("user-D", "profile.refine")).toThrow();

    // At midnight UTC: bucket has expired and the next call is fresh.
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));
    expect(() => checkRateLimit("user-D", "profile.refine")).not.toThrow();
    expect(getRateLimitStatus("user-D", "profile.refine").count).toBe(1);
  });

  it("resetAt always points at the next midnight UTC, not the next 24h", () => {
    // Status at noon UTC reports midnight tonight, not noon tomorrow.
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    const status = getRateLimitStatus("user-E", "profile.refine");
    expect(new Date(status.resetAt).toISOString()).toBe(
      "2026-05-04T00:00:00.000Z",
    );
  });

  it("getRateLimitStatus reports an empty bucket as count=0", () => {
    const status = getRateLimitStatus("never-used", "profile.refine");
    expect(status.count).toBe(0);
    expect(status.limit).toBe(10);
  });
});
