// Hand-runnable: pnpm tsx src/lib/rateLimiter.test.ts
import { createTokenBucket } from "./rateLimiter.js";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<number> {
  const start = Date.now();
  await fn();
  const elapsed = Date.now() - start;
  console.log(`${label}: ${elapsed}ms`);
  return elapsed;
}

async function run(): Promise<void> {
  // Burst of 10 requests against a 4-per-second bucket. First 4 are immediate;
  // the next 6 require ~250ms each → total ~1500ms.
  const limiter = createTokenBucket({ capacity: 4, intervalMs: 1000 });
  const elapsed = await timed("10 acquires on 4/s bucket", async () => {
    await Promise.all(Array.from({ length: 10 }, () => limiter.acquire()));
  });

  if (elapsed < 1300 || elapsed > 1900) {
    throw new Error(`expected ~1500ms, got ${elapsed}ms`);
  }

  // FIFO order: queue 5 acquires, ensure they resolve in submission order.
  const fifoLimiter = createTokenBucket({ capacity: 1, intervalMs: 100 });
  const order: number[] = [];
  await Promise.all(
    [0, 1, 2, 3, 4].map((i) => fifoLimiter.acquire().then(() => order.push(i))),
  );
  if (order.join(",") !== "0,1,2,3,4") {
    throw new Error(`FIFO violated: ${order.join(",")}`);
  }
  console.log("FIFO order: OK");

  console.log("\nrate limiter passes");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
