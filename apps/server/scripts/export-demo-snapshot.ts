/**
 * Export a static demo snapshot for the client's public /demo route.
 *
 * Run from the repo root:
 *   pnpm --filter @resonance/server exec tsx scripts/export-demo-snapshot.ts
 *
 * Picks the user with the largest library (in practice: the repo author,
 * whose profile is already publicly showcased via Constellation's /demo)
 * and writes their themes + library format counts + one artwork-rich batch
 * to apps/client/src/demo/snapshot.json. The client bakes the JSON into the
 * bundle — no server endpoint, nothing user-identifying in the output
 * (content only; no ids, no emails).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import {
  libraryItems,
  tasteProfiles,
  recommendationBatches,
} from "../src/db/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  here,
  "..",
  "..",
  "client",
  "src",
  "demo",
  "snapshot.json",
);

// 1. The user with the largest library.
const [biggest] = await db
  .select({ userId: libraryItems.userId, items: count() })
  .from(libraryItems)
  .groupBy(libraryItems.userId)
  .orderBy(desc(count()))
  .limit(1);
if (!biggest) {
  console.error("No library items found — nothing to export.");
  process.exit(1);
}
console.log(
  `[demo-export] largest library: ${biggest.items} items (user id withheld from output)`,
);

// 2. Their taste profile — themes only. Same shape ProfileView consumes.
const profileRow = await db.query.tasteProfiles.findFirst({
  where: eq(tasteProfiles.userId, biggest.userId),
});
if (!profileRow) {
  console.error("Selected user has no taste profile.");
  process.exit(1);
}
const themes = profileRow.profileData.themes.map((t) => ({
  label: t.label,
  summary: t.summary ?? t.evidence ?? "",
  weight: t.weight,
  anchors: (t.anchors ?? []).map((a) => ({
    title: a.title,
    mediaType: a.mediaType,
  })),
}));

// 3. Library format counts.
const formatRows = await db
  .select({ mediaType: libraryItems.mediaType, n: count() })
  .from(libraryItems)
  .where(eq(libraryItems.userId, biggest.userId))
  .groupBy(libraryItems.mediaType);
const libraryCounts: Record<string, number> = {};
for (const r of formatRows) libraryCounts[r.mediaType] = r.n;

// 4. Most recent batch with >= 4 artwork-bearing recommendations.
const batches = await db.query.recommendationBatches.findMany({
  where: eq(recommendationBatches.userId, biggest.userId),
  orderBy: [desc(recommendationBatches.createdAt)],
  with: { recommendations: { with: { media: true } } },
});
const showcase = batches.find(
  (b) =>
    b.recommendations.filter((r) => r.media.normalizedData.imageUrl).length >=
    4,
);
if (!showcase) {
  console.error("No batch with >= 4 artwork-bearing recommendations found.");
  process.exit(1);
}
// The demo wants a tasting flight, not the full batch: the strongest
// pick in each format, capped at five formats. Strict top-N-by-score
// collapses into one format (books, for this profile) and hides the
// cross-format reach the page exists to demonstrate. totalPicks is
// exported so the page can be honest about the cut.
const DEMO_PICK_CAP = 5;
const bestPerFormat = new Map<string, (typeof showcase.recommendations)[number]>();
for (const r of showcase.recommendations) {
  if (!r.media.normalizedData.imageUrl) continue;
  const prev = bestPerFormat.get(r.media.mediaType);
  if (!prev || r.matchScore > prev.matchScore) {
    bestPerFormat.set(r.media.mediaType, r);
  }
}
const picks = [...bestPerFormat.values()]
  .sort((a, b) => b.matchScore - a.matchScore)
  .slice(0, DEMO_PICK_CAP)
  .map((r) => ({
    title: r.media.normalizedData.title,
    mediaType: r.media.mediaType,
    year: r.media.normalizedData.year,
    artworkUrl: r.media.normalizedData.imageUrl,
    matchScore: r.matchScore,
    explanation: r.explanation,
  }));

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  libraryTotal: biggest.items,
  libraryCounts,
  themes,
  batch: {
    prompt: showcase.prompt,
    name: showcase.name,
    createdAt: showcase.createdAt,
    totalPicks: showcase.recommendations.length,
    picks,
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `[demo-export] wrote ${picks.length} picks, ${themes.length} themes → ${outPath}`,
);
