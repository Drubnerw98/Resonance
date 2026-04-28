import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  recommendations,
  type RecommendationRow,
} from "../db/schema.js";
import type { RecommendationStatus } from "@resonance/shared";

export interface FeedbackInput {
  status: RecommendationStatus;
  rating?: number | null;
}

/**
 * Update a single recommendation's status / rating. The `userId` check
 * prevents users from writing to other users' rows; we'd already filter via
 * Clerk auth at the route, but the explicit predicate is defense in depth.
 */
export async function applyFeedback(
  userId: string,
  recommendationId: string,
  input: FeedbackInput,
): Promise<RecommendationRow | null> {
  const [updated] = await db
    .update(recommendations)
    .set({
      status: input.status,
      rating: input.rating ?? null,
      actedAt: new Date(),
    })
    .where(
      and(
        eq(recommendations.id, recommendationId),
        eq(recommendations.userId, userId),
      ),
    )
    .returning();
  return updated ?? null;
}

/**
 * Count feedback rows recorded since `since` for `userId`. Used by the
 * auto-refinement trigger to decide whether to fire a new profile pass.
 * "Feedback" means status moved off the default `pending`.
 */
export async function countFeedbackSince(
  userId: string,
  since: Date,
): Promise<number> {
  const rows = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      gt(recommendations.actedAt, since),
    ),
    columns: { id: true },
  });
  return rows.length;
}
