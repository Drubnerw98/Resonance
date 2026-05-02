/**
 * Backfill fit_note + taste_tags onto manual + consumed library_items rows
 * that pre-date the annotation feature.
 *
 * Run from a local machine pointed at the target database via DATABASE_URL
 * (e.g. prod via Neon connection string). Sequential — one item at a time
 * — because:
 *   - the AI provider rate-limits us at the account level, not the request
 *     level, so parallelizing doesn't speed up the practical throughput
 *   - this is a one-time per-deploy operation; throughput rarely matters
 *
 * Per-item failure (model error, network blip, profile missing) leaves the
 * row alone and continues. Re-running the script picks up exactly the rows
 * that didn't get annotated — `fit_note IS NULL` survives partial runs.
 *
 * Invocation:
 *   pnpm --filter @resonance/server tsx src/scripts/backfillLibraryAnnotations.ts
 *   # or, by user:
 *   pnpm --filter @resonance/server tsx src/scripts/backfillLibraryAnnotations.ts <userId>
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { libraryItems } from "../db/schema.js";
import {
  annotateLibraryItem,
  persistAnnotation,
} from "../services/ai/libraryAnnotation.js";

async function main(): Promise<void> {
  const userIdArg = process.argv[2];

  const where = userIdArg
    ? and(
        eq(libraryItems.source, "manual"),
        eq(libraryItems.status, "consumed"),
        eq(libraryItems.userId, userIdArg),
        isNull(libraryItems.fitNote),
      )
    : and(
        eq(libraryItems.source, "manual"),
        eq(libraryItems.status, "consumed"),
        isNull(libraryItems.fitNote),
      );

  const rows = await db
    .select({
      id: libraryItems.id,
      userId: libraryItems.userId,
      title: libraryItems.title,
      mediaType: libraryItems.mediaType,
    })
    .from(libraryItems)
    .where(where);

  if (rows.length === 0) {
    console.log("[backfill] no rows to annotate — nothing to do.");
    return;
  }

  console.log(
    `[backfill] annotating ${rows.length} item(s)${userIdArg ? ` for user ${userIdArg}` : ""}…`,
  );

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const label = `${i + 1}/${rows.length} ${row.title} (${row.mediaType})`;
    try {
      const result = await annotateLibraryItem(row.userId, row.id);
      await persistAnnotation(row.id, result);
      ok += 1;
      console.log(
        `  ✓ ${label} — tags: [${result.annotation.tasteTags.join(", ")}]`,
      );
    } catch (err) {
      failed += 1;
      console.error(
        `  ✗ ${label} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `[backfill] done. ${ok} succeeded, ${failed} failed. Re-run to retry failures.`,
  );
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
