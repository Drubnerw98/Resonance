/**
 * Env loading for the eval harness. Shares the repo-root .env.local with the
 * server — the eval connects to the same DB the server writes to. Validated
 * with the same loud-fail-at-boot pattern apps/server uses.
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

loadEnv({ path: resolve(repoRoot, ".env.local") });
loadEnv({ path: resolve(repoRoot, ".env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** Optional — if set, the eval scopes its queries to this single user
   * (matches `users.id`, not the Clerk id). Useful for local runs where
   * you only want to evaluate your own batches without scanning every
   * row in the table. Unset = scan all users. */
  EVAL_USER_ID: z.string().uuid().optional(),
  /** Optional Anthropic key — only used by LLM-judge suite. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`[eval] invalid environment:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
