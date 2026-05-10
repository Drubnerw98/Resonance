import { and, desc, eq, gt } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { TasteProfile } from "@resonance/shared";
import { db } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import { recommendations } from "../../db/schema.js";
import { getActiveProfile, saveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { profileRefinementSystemPrompt } from "./prompts/profileRefinement.js";
import { TasteProfileSchema } from "./schemas.js";
import { aiTimeoutSignal, withAiTimeout } from "./aiTimeout.js";

/** Number of post-pending feedback items required before auto-refinement fires. */
const REFINEMENT_THRESHOLD = 5;

/**
 * Returns true if the user has accumulated enough feedback since their last
 * profile save to trigger an auto-refinement. The feedback route uses this to
 * tell the client "your save is what kicked the refinement off" — UI shows a
 * banner. Evaluated synchronously (one quick count query) so the PATCH
 * response doesn't have to wait for the actual model call.
 */
export async function wouldTriggerRefinement(userId: string): Promise<boolean> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) return false;
  const recentFeedback = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      gt(recommendations.actedAt, profileRow.updatedAt),
    ),
    columns: { id: true },
  });
  return recentFeedback.length >= REFINEMENT_THRESHOLD;
}

/** Hard ceiling on how many recent feedback items we feed to the model. */
const MAX_FEEDBACK_FOR_REFINEMENT = 25;

interface FeedbackForRefinement {
  title: string;
  mediaType: string;
  status: string;
  rating: number | null;
  tasteTags: string[];
}

/**
 * Auto-refinement check. Runs after each feedback PATCH. Counts how many
 * feedback items have been recorded since the user's profile was last
 * updated; if it's at or above the threshold, fires the refinement.
 *
 * Returns the refined profile if refinement ran, null otherwise. Errors are
 * thrown — callers run this fire-and-forget so they wrap with .catch().
 */
export async function maybeRefineProfile(
  userId: string,
): Promise<TasteProfile | null> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) return null;

  const since = profileRow.updatedAt;
  const recentFeedback = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      gt(recommendations.actedAt, since),
    ),
    columns: { id: true },
  });

  // Always log progress so the user can see the auto-refinement chain in
  // Render logs — even when below threshold ("X / 5 — not yet"). Helps verify
  // the system is wired correctly without needing to instrument the UI.
  if (recentFeedback.length < REFINEMENT_THRESHOLD) {
    logger.info(
      {
        userId,
        feedbackCount: recentFeedback.length,
        threshold: REFINEMENT_THRESHOLD,
        sinceVersion: profileRow.currentVersion,
      },
      "refinement: below threshold, skipping",
    );
    return null;
  }

  logger.info(
    {
      userId,
      feedbackCount: recentFeedback.length,
      threshold: REFINEMENT_THRESHOLD,
      fromVersion: profileRow.currentVersion,
    },
    "refinement: threshold reached, refining",
  );
  const refined = await refineProfile(userId);
  const after = await getActiveProfile(userId);
  logger.info(
    { userId, newVersion: after?.currentVersion },
    "refinement: done",
  );
  return refined;
}

/**
 * Manual refinement entry point. Used by POST /api/profile/refine and by the
 * auto-trigger above. Pulls the most recent feedback (newest-first, capped),
 * regardless of when the profile was last updated — so a manual refine
 * triggered right after an auto-refine still has data to work with. Errors
 * only when the user has provided literally no feedback ever.
 */
export async function refineProfile(userId: string): Promise<TasteProfile> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    throw new Error("Cannot refine: user has no taste profile yet");
  }

  const feedback = await collectRecentFeedback(userId);
  if (feedback.length === 0) {
    throw new Error("No feedback yet — react to some recommendations first");
  }

  logger.info(
    { feedbackCount: feedback.length },
    "refinement: refining profile",
  );

  const refined = await callRefinementModel(profileRow.profileData, feedback);
  const saved = await saveProfile(userId, refined, "feedback_batch");
  return saved.profileData;
}

/**
 * Pulls the user's most recent feedback items, newest-first, capped. Used for
 * the manual refinement flow where we don't constrain by profile.updatedAt
 * — the manual button works on whatever recent signal exists.
 */
async function collectRecentFeedback(
  userId: string,
): Promise<FeedbackForRefinement[]> {
  const rows = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      // Acted_at is null for pending recs; only include rows that received
      // some kind of feedback action.
      gt(recommendations.actedAt, new Date(0)),
    ),
    orderBy: [desc(recommendations.actedAt)],
    limit: MAX_FEEDBACK_FOR_REFINEMENT,
    with: { media: true },
  });

  return rows.map((r) => ({
    title: r.media.title,
    mediaType: r.media.mediaType,
    status: r.status,
    rating: r.rating,
    tasteTags: r.tasteTags,
  }));
}

async function callRefinementModel(
  current: TasteProfile,
  feedback: FeedbackForRefinement[],
): Promise<TasteProfile> {
  const client = getAnthropic();

  const userMessage = `# Current TasteProfile

${JSON.stringify(current, null, 2)}

# Recent feedback (newest first)

${feedback
  .map(
    (f, i) =>
      `[${i + 1}] ${f.title} (${f.mediaType}) — status=${f.status}${f.rating != null ? `, rating=${f.rating}` : ""}, tasteTags=[${f.tasteTags.join(", ")}]`,
  )
  .join("\n")}

Evolve the profile.`;

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: ONBOARDING_MODEL,
      max_tokens: 4096,
      system: profileRefinementSystemPrompt(),
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: zodOutputFormat(
          TasteProfileSchema as unknown as Parameters<
            typeof zodOutputFormat
          >[0],
        ),
      },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(
      `Refinement failed: model did not return a parseable profile (stop_reason=${response.stop_reason})`,
    );
  }

  return TasteProfileSchema.parse(response.parsed_output) as TasteProfile;
}
