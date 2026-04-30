// Live smoke test against all four media providers + Neon. Run with:
//   pnpm tsx src/services/mediaCache.test.ts
//
// Hits real APIs and writes to the real media_cache table. Assumes
// TMDB_API_KEY, IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, and DATABASE_URL are
// filled in .env.local. Open Library and Jikan need no credentials.
//
// Not part of the typecheck/build — purely a hand-runnable script.

import "../env.js";
import { searchAndCacheByQuery, searchAndCacheByTitle } from "./mediaCache.js";
import type { MediaCacheRow } from "../db/schema.js";

function summarize(label: string, rows: MediaCacheRow[]): void {
  console.log(`\n--- ${label} ---`);
  console.log(`got ${rows.length} hit(s)`);
  for (const r of rows.slice(0, 3)) {
    const item = r.normalizedData;
    console.log(
      `  - [${item.source}/${item.mediaType}] ${item.title} (${item.year ?? "?"}) rating=${item.rating ?? "—"} cover=${item.imageUrl ? "yes" : "no"}`,
    );
  }
}

async function main(): Promise<void> {
  // TMDB
  summarize(
    "TMDB title: 'severance' / tv",
    await searchAndCacheByTitle("tv", "severance"),
  );
  summarize(
    "TMDB query: tv, Drama+Mystery, 2018+",
    await searchAndCacheByQuery({
      mediaType: "tv",
      genres: ["Drama", "Mystery"],
      yearFrom: 2018,
      limit: 5,
    }),
  );

  // IGDB
  summarize(
    "IGDB title: 'disco elysium' / game",
    await searchAndCacheByTitle("game", "disco elysium"),
  );
  summarize(
    "IGDB query: game, RPG genre, 2015+",
    await searchAndCacheByQuery({
      mediaType: "game",
      genres: ["Role-playing (RPG)"],
      yearFrom: 2015,
      limit: 5,
    }),
  );

  // Jikan
  summarize(
    "Jikan title: 'frieren' / anime",
    await searchAndCacheByTitle("anime", "frieren"),
  );
  summarize(
    "Jikan query: manga, Seinen + Drama",
    await searchAndCacheByQuery({
      mediaType: "manga",
      genres: ["Seinen", "Drama"],
      limit: 5,
    }),
  );

  // Open Library
  summarize(
    "Open Library title: 'fahrenheit 451' / book",
    await searchAndCacheByTitle("book", "fahrenheit 451"),
  );
  summarize(
    "Open Library query: book, science fiction",
    await searchAndCacheByQuery({
      mediaType: "book",
      genres: ["science_fiction"],
      limit: 5,
    }),
  );

  console.log("\nall four adapters reachable, caching working");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
