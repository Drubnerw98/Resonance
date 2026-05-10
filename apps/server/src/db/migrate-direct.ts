// Bypass for the full env validator. Use when applying migrations from a
// machine that only has DATABASE_URL (e.g. ad-hoc prod migrate from a laptop
// without the full server env populated). Same migrator as migrate.ts.
//
// Usage: DATABASE_URL="postgres://..." pnpm tsx src/db/migrate-direct.ts

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "migrations");

const sql = neon(url);
const db = drizzle(sql);

console.log(`[resonance] applying migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
console.log("[resonance] migrations complete");
