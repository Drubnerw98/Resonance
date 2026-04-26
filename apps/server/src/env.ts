import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// apps/server/src/env.ts — go up 3 levels (src → server → apps → repo root).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// Load .env.local first (developer-local, gitignored), then .env as a fallback
// for prod-style deploys. dotenv silently no-ops if the file is missing and
// won't overwrite vars already present in process.env, so order matters: the
// first call wins.
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });
