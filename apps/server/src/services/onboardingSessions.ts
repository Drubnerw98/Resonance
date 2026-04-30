import { and, eq, gt } from "drizzle-orm";
import type { OnboardingMessage } from "@resonance/shared";
import { db } from "../db/index.js";
import { onboardingSessions, type OnboardingSession } from "../db/schema.js";

/**
 * Returns the user's most relevant onboarding session.
 *
 * Priority order:
 *   1. An ACTIVE session — if you have an ongoing conversation, that's
 *      what you want to see, even if it has no turns yet (e.g., the user
 *      just clicked "Continue onboarding" and we created a fresh active
 *      session — they want the empty chat, not their old completed one).
 *   2. The latest session WITH content (turnCount > 0). Used to keep a
 *      completed transcript visible after completion across page loads.
 *   3. The latest session of any kind, as a final fallback.
 *
 * Returns null if the user has never onboarded.
 */
export async function getLatestSession(
  userId: string,
): Promise<OnboardingSession | null> {
  const active = await db.query.onboardingSessions.findFirst({
    where: and(
      eq(onboardingSessions.userId, userId),
      eq(onboardingSessions.status, "active"),
    ),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (active) return active;

  const withContent = await db.query.onboardingSessions.findFirst({
    where: and(
      eq(onboardingSessions.userId, userId),
      gt(onboardingSessions.turnCount, 0),
    ),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (withContent) return withContent;

  const any = await db.query.onboardingSessions.findFirst({
    where: eq(onboardingSessions.userId, userId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  return any ?? null;
}

/**
 * Returns the user's currently-active onboarding session, creating an empty
 * one if none exists. The unique-by-status pattern isn't enforced at the DB
 * level (a user can have past abandoned/completed sessions), so we filter to
 * `status = 'active'` here.
 */
export async function getOrCreateActiveSession(
  userId: string,
): Promise<OnboardingSession> {
  const existing = await db.query.onboardingSessions.findFirst({
    where: and(
      eq(onboardingSessions.userId, userId),
      eq(onboardingSessions.status, "active"),
    ),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(onboardingSessions)
    .values({
      userId,
      status: "active",
      messages: [],
      turnCount: 0,
    })
    .returning();
  if (!created) throw new Error("Failed to create onboarding session");
  return created;
}

/**
 * Append a single message to a session's transcript. Used twice per turn:
 * once for the user message, once for the assistant message after streaming
 * completes. We persist the full assistant text including <analysis> blocks —
 * the stripping is for client display only; the model's own scratchpad stays
 * in the transcript so subsequent turns have continuity.
 */
export async function appendMessage(
  sessionId: string,
  message: OnboardingMessage,
): Promise<OnboardingSession> {
  const session = await db.query.onboardingSessions.findFirst({
    where: eq(onboardingSessions.id, sessionId),
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const messages = [...session.messages, message];
  const turnCount =
    message.role === "assistant" ? session.turnCount + 1 : session.turnCount;

  const [updated] = await db
    .update(onboardingSessions)
    .set({ messages, turnCount })
    .where(eq(onboardingSessions.id, sessionId))
    .returning();
  if (!updated) throw new Error("Failed to update session");
  return updated;
}

/**
 * Force-start a brand-new active session, even if one exists already (the
 * previous active session, if any, is marked abandoned). Used by the
 * "Continue onboarding" / "Talk to it again" flow on the profile page —
 * we want a fresh transcript without losing the old one.
 */
export async function startNewSession(
  userId: string,
): Promise<OnboardingSession> {
  // Mark any existing active session as abandoned so getOrCreate doesn't
  // pick it up later.
  await db
    .update(onboardingSessions)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(onboardingSessions.userId, userId),
        eq(onboardingSessions.status, "active"),
      ),
    );

  const [created] = await db
    .insert(onboardingSessions)
    .values({
      userId,
      status: "active",
      messages: [],
      turnCount: 0,
    })
    .returning();
  if (!created) throw new Error("Failed to create onboarding session");
  return created;
}

export async function markSessionCompleted(
  sessionId: string,
): Promise<OnboardingSession> {
  const [updated] = await db
    .update(onboardingSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(onboardingSessions.id, sessionId))
    .returning();
  if (!updated) throw new Error(`Session ${sessionId} not found`);
  return updated;
}
