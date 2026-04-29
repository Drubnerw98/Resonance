import { and, eq } from "drizzle-orm";
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
 *
 * Rating semantics:
 *   - `input.rating === undefined` → don't touch the column (toggling
 *     save/skip on a previously-rated rec preserves the rating).
 *   - `input.rating === null`     → explicitly clear the rating (used by
 *     the unrate flow).
 *   - `input.rating === <number>` → set to that value.
 */
export async function applyFeedback(
  userId: string,
  recommendationId: string,
  input: FeedbackInput,
): Promise<RecommendationRow | null> {
  const updates: { status: typeof input.status; rating?: number | null; actedAt: Date } = {
    status: input.status,
    actedAt: new Date(),
  };
  if (input.rating !== undefined) {
    updates.rating = input.rating;
  }
  const [updated] = await db
    .update(recommendations)
    .set(updates)
    .where(
      and(
        eq(recommendations.id, recommendationId),
        eq(recommendations.userId, userId),
      ),
    )
    .returning();
  return updated ?? null;
}
