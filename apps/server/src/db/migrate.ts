import "../env.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "migrations");

const sql = neon(databaseUrl);
const db = drizzle(sql);

console.log(`[resonance] applying migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
console.log("[resonance] migrations complete");
