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
