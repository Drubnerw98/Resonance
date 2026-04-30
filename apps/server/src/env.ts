import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// apps/server/src/env.ts — go up 3 levels (src → server → apps → repo root).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// Load .env.local first (developer-local, gitignored), then .env as a fallback
// for prod-style deploys. dotenv silently no-ops if the file is missing and
// won't overwrite vars already present in process.env, so order matters: the
// first call wins.
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),

  // Clerk reads these directly via clerkMiddleware(); validating here so a
  // missing key fails loudly at boot instead of on the first auth'd request.
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),

  TMDB_API_KEY: z.string().min(1),
  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),

  // Optional — Steam library import is gated on this being present.
  STEAM_API_KEY: z.string().min(1).optional(),

  // Comma-separated origin allowlist. Unset in dev (Vite proxies same-origin).
  FRONTEND_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
