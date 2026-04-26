import "./src/env.js";
import { defineConfig } from "drizzle-kit";

// drizzle-kit `generate` only reads the schema file and doesn't connect to the
// DB, so we accept a placeholder URL there. Commands that actually talk to the
// database (`migrate`, `push`, `studio`) will fail loudly downstream if the
// real DATABASE_URL isn't set.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost/placeholder";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
