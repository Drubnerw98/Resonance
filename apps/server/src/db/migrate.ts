import { env } from "../env.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "migrations");

const sql = neon(env.DATABASE_URL);
const db = drizzle(sql);

console.log(`[resonance] applying migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
console.log("[resonance] migrations complete");
