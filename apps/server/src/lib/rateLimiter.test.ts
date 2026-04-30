import { describe, expect, it } from "vitest";
import { createTokenBucket } from "./rateLimiter.js";

describe("createTokenBucket", () => {
  it("throttles a 10-burst against a 4-per-1000ms bucket to ~1500ms", { timeout: 5_000 }, async () => {
    const limiter = createTokenBucket({ capacity: 4, intervalMs: 1000 });
    const start = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => limiter.acquire()));
    const elapsed = Date.now() - start;
    // First 4 are immediate, next 6 take ~250ms each → ~1500ms.
    expect(elapsed).toBeGreaterThanOrEqual(1300);
    expect(elapsed).toBeLessThanOrEqual(1900);
  });

  it("dispatches queued acquires in FIFO order", async () => {
    const limiter = createTokenBucket({ capacity: 1, intervalMs: 100 });
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        limiter.acquire().then(() => {
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});
