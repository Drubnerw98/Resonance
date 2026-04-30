import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    // Live-API smoke tests (e.g. mediaCache.smoke.ts) are excluded from the
    // default suite — run them by hand via `pnpm tsx <path>`.
    environment: "node",
    pool: "forks",
  },
});
