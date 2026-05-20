/**
 * Deterministic invariant checks against the persisted recommendation data.
 *
 * These pin the structural guarantees the recommendation pipeline is
 * supposed to make. A violation means the pipeline lied about something
 * — not a quality issue, a correctness issue. Each invariant runs against
 * every batch and accumulates per-batch violations into one aggregated
 * report.
 *
 * No model calls, no Anthropic spend. Safe to run on every CI tick.
 */

import { desc, eq } from "drizzle-orm";
import { buildAnchorBlob, titleAppearsIn } from "@resonance/shared";
import { simpleCanonicalize } from "./canonicalize.js";
import {
  db,
  libraryItems,
  recommendationBatches,
  tasteProfiles,
  users,
} from "./db.js";

const CANONICAL_MEDIA_TYPES = new Set([
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

export interface InvariantViolation {
  invariant: string;
  batchId: string;
  userId: string;
  detail: string;
}

export interface InvariantReport {
  name: string;
  description: string;
  batchesChecked: number;
  recsChecked: number;
  violationsFound: number;
  violations: InvariantViolation[];
}

export interface InvariantsRunResult {
  totalBatches: number;
  totalRecs: number;
  reports: InvariantReport[];
}

export interface RunInvariantsOptions {
  /** Limit to a single user. Unset = every user with batches. */
  userId?: string | undefined;
}

export async function runInvariants(
  options: RunInvariantsOptions = {},
): Promise<InvariantsRunResult> {
  // Pre-build the per-user anchor lookup so the cross-ref invariant doesn't
  // refetch on every batch. Eval runs are infrequent; one pass through
  // users + library + profile is fine.
  const userRows = options.userId
    ? await db.query.users.findMany({ where: eq(users.id, options.userId) })
    : await db.query.users.findMany();

  const anchorByUserId = new Map<string, string>();
  const libraryTitlesByUserId = new Map<string, string[]>();

  for (const u of userRows) {
    const [profileRow, libraryRows] = await Promise.all([
      db.query.tasteProfiles.findFirst({
        where: eq(tasteProfiles.userId, u.id),
      }),
      db.query.libraryItems.findMany({
        where: eq(libraryItems.userId, u.id),
      }),
    ]);
    const libTitles = libraryRows.map((r) => r.title);
    libraryTitlesByUserId.set(u.id, libTitles);
    anchorByUserId.set(
      u.id,
      buildAnchorBlob(profileRow?.profileData ?? null, libTitles),
    );
  }

  // Load every batch (optionally scoped) along with its recs + joined media.
  const batches = await db.query.recommendationBatches.findMany({
    where: options.userId
      ? eq(recommendationBatches.userId, options.userId)
      : undefined,
    orderBy: [desc(recommendationBatches.createdAt)],
    with: {
      recommendations: {
        with: { media: true },
      },
    },
  });

  const orphans: InvariantViolation[] = [];
  const badMediaTypes: InvariantViolation[] = [];
  const duplicates: InvariantViolation[] = [];
  const unanchoredXrefs: InvariantViolation[] = [];

  let totalRecs = 0;

  for (const batch of batches) {
    const anchorBlob = anchorByUserId.get(batch.userId) ?? "";

    const canonicalSeen = new Map<string, string>();
    for (const rec of batch.recommendations) {
      totalRecs += 1;

      // 1. Orphan check. The FK should make this impossible, but the JOIN
      // returns null media if a row got deleted out from under the FK.
      if (!rec.media) {
        orphans.push({
          invariant: "rec-has-real-media-row",
          batchId: batch.id,
          userId: batch.userId,
          detail: `rec ${rec.id} references a missing media_cache row (${rec.mediaCacheId})`,
        });
        continue;
      }

      // 2. Media type is in the canonical enum set. Postgres enforces at
      // insert time; a violation here means schema drift.
      if (!CANONICAL_MEDIA_TYPES.has(rec.media.mediaType)) {
        badMediaTypes.push({
          invariant: "rec-mediatype-canonical",
          batchId: batch.id,
          userId: batch.userId,
          detail: `rec ${rec.id} has non-canonical mediaType "${rec.media.mediaType}"`,
        });
      }

      // 3. Within-batch duplicate by simple canonical. If the system's
      // canonicalizer matches more aggressively, our coarse one shouldn't
      // catch anything it missed.
      const canon = simpleCanonicalize(rec.media.title);
      const existing = canonicalSeen.get(canon);
      if (existing) {
        duplicates.push({
          invariant: "no-canonical-duplicates-within-batch",
          batchId: batch.id,
          userId: batch.userId,
          detail: `"${rec.media.title}" and "${existing}" canonicalize to the same form ("${canon}")`,
        });
      } else {
        canonicalSeen.set(canon, rec.media.title);
      }

      // 4. Every cross-referenced title is anchored in the user's profile
      // or library. A rec citing "you loved X" where X isn't in the
      // user's data is a fabrication — the strongest correctness failure
      // in the system.
      for (const xref of rec.crossReferences ?? []) {
        if (!titleAppearsIn(xref.title, anchorBlob)) {
          unanchoredXrefs.push({
            invariant: "cross-reference-anchored",
            batchId: batch.id,
            userId: batch.userId,
            detail: `rec ${rec.id} cites "${xref.title}" but it's not in the user's library or profile`,
          });
        }
      }
    }
  }

  return {
    totalBatches: batches.length,
    totalRecs,
    reports: [
      {
        name: "rec-has-real-media-row",
        description:
          "Every recommendation row joins to a real media_cache row (anti-hallucination guarantee).",
        batchesChecked: batches.length,
        recsChecked: totalRecs,
        violationsFound: orphans.length,
        violations: orphans,
      },
      {
        name: "rec-mediatype-canonical",
        description:
          "Every recommendation's mediaType is one of the six canonical media types.",
        batchesChecked: batches.length,
        recsChecked: totalRecs,
        violationsFound: badMediaTypes.length,
        violations: badMediaTypes,
      },
      {
        name: "no-canonical-duplicates-within-batch",
        description:
          "No two recommendations within the same batch canonicalize to the same simplified title.",
        batchesChecked: batches.length,
        recsChecked: totalRecs,
        violationsFound: duplicates.length,
        violations: duplicates,
      },
      {
        name: "cross-reference-anchored",
        description:
          "Every cross_references[].title is findable in the user's library, profile favorites, or theme evidence (no fabricated anchors).",
        batchesChecked: batches.length,
        recsChecked: totalRecs,
        violationsFound: unanchoredXrefs.length,
        violations: unanchoredXrefs,
      },
    ],
  };
}
