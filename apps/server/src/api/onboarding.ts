import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { SSEWriter } from "../lib/sse.js";
import {
  appendMessage,
  getLatestSession,
  getOrCreateActiveSession,
  markSessionCompleted,
  startNewSession,
} from "../services/onboardingSessions.js";
import { streamOnboardingReply } from "../services/ai/onboarding.js";
import {
  evolveProfileFromTranscript,
  extractProfile,
} from "../services/ai/extraction.js";
import { getActiveProfile, saveProfile } from "../services/profile.js";
import { markOnboardingComplete } from "../services/users.js";
import type { OnboardingMessage, ProfileTrigger } from "@resonance/shared";

export const onboardingRouter: Router = Router();

onboardingRouter.use(requireUser);

const messageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

// Deterministic floor on top of the model's <ready/> self-judgment. The
// onboarding prompt asks the model to require 6+ turns + named titles +
// avoidance probe before signalling, but models occasionally fire early
// against thin transcripts. This floor silently drops the signal in those
// cases — the conversation continues and the user gets more probing turns.
const MIN_USER_TURNS_FOR_READY = 5;
const MIN_USER_WORDS_FOR_READY = 200;

function meetsReadinessFloor(messages: OnboardingMessage[]): boolean {
  let userTurns = 0;
  let userWords = 0;
  for (const m of messages) {
    if (m.role !== "user") continue;
    userTurns += 1;
    // Cheap word count — whitespace split is good enough for a floor check.
    userWords += m.content.trim().split(/\s+/).filter(Boolean).length;
  }
  return (
    userTurns >= MIN_USER_TURNS_FOR_READY &&
    userWords >= MIN_USER_WORDS_FOR_READY
  );
}

/**
 * GET /api/onboarding/session
 * Returns the user's active session, creating an empty one if none exists.
 * The frontend uses this on mount to hydrate the chat with prior history.
 */
onboardingRouter.get("/session", async (req, res, next) => {
  try {
    // Prefer the most recent session (any status) so a completed session
    // keeps showing post-completion. Only create a new active session if the
    // user has never onboarded.
    const session =
      (await getLatestSession(req.user!.id)) ??
      (await getOrCreateActiveSession(req.user!.id));
    // The DB stores the full raw assistant text (with reasoning + <ready/>);
    // we strip those for display but use the raw form here to derive a durable
    // `ready` flag so the "Finish onboarding" button survives a page refresh.
    // Apply the deterministic floor — if the model fired ready early against a
    // thin transcript, treat it as not-ready until the conversation grows.
    const modelSignaledReady = session.messages.some(
      (m) => m.role === "assistant" && m.content.includes("<ready/>"),
    );
    const ready =
      modelSignaledReady && meetsReadinessFloor(session.messages);
    const visibleMessages = session.messages.map((m) => ({
      role: m.role,
      content:
        m.role === "assistant" ? stripModelTags(m.content) : m.content,
    }));
    res.json({
      id: session.id,
      status: session.status,
      turnCount: session.turnCount,
      ready,
      messages: visibleMessages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/onboarding/message
 * SSE endpoint. Body: { content }. Appends the user message, streams the
 * assistant reply with analysis/ready tags filtered out, persists the full
 * raw assistant text on completion, and emits a `ready` event if the model
 * signaled completion.
 */
onboardingRouter.post("/message", async (req, res, next) => {
  let parsed: { content: string };
  try {
    parsed = messageSchema.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: "invalid body", detail: String(err) });
    return;
  }

  let sse: SSEWriter | null = null;
  try {
    const session = await getOrCreateActiveSession(req.user!.id);

    if (session.status !== "active") {
      res
        .status(409)
        .json({ error: "session is not active", status: session.status });
      return;
    }

    const userMessage: OnboardingMessage = {
      role: "user",
      content: parsed.content,
    };
    const updated = await appendMessage(session.id, userMessage);

    sse = new SSEWriter(res);
    sse.send("session", { id: updated.id, turnCount: updated.turnCount });

    // Floor is computed once at turn start (cheap and stable for the duration
    // of one assistant reply — the assistant's own message doesn't add user
    // words). If unmet, we'll silently drop any <ready/> the model fires this
    // turn so the frontend doesn't show "finish" prematurely.
    const floorMet = meetsReadinessFloor(updated.messages);

    const { chunks, done } = streamOnboardingReply(updated.messages);

    for await (const chunk of chunks) {
      if (chunk.text) sse.send("token", { text: chunk.text });
      if (chunk.ready && floorMet) sse.send("ready", {});
    }

    const { raw, ready } = await done;
    await appendMessage(session.id, { role: "assistant", content: raw });

    if (ready && !floorMet) {
      console.warn(
        `[onboarding] dropped premature <ready/> for session ${session.id} (turns/words below floor)`,
      );
    }

    sse.send("done", {});
    sse.end();
  } catch (err) {
    if (sse) {
      sse.send("error", {
        message: err instanceof Error ? err.message : "unknown error",
      });
      sse.end();
      return;
    }
    next(err);
  }
});

/**
 * POST /api/onboarding/restart
 * Force-creates a brand-new active onboarding session, marking any current
 * active session as abandoned. Used by the "Continue onboarding" / "Talk
 * about it again" flow when the user wants to add to their profile.
 * Returns the new session.
 */
onboardingRouter.post("/restart", async (req, res, next) => {
  try {
    const session = await startNewSession(req.user!.id);
    res.json({
      id: session.id,
      status: session.status,
      turnCount: 0,
      ready: false,
      messages: [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/onboarding/complete
 * Idempotent. Extracts a TasteProfile from the user's most recent session
 * (active or completed), saves it as a versioned snapshot, marks the session
 * completed if it wasn't, and flips the user's onboarding_status to
 * "complete". If a profile already exists for this user we return it
 * without re-extracting — callers can replay this endpoint safely on
 * network failures.
 */
onboardingRouter.post("/complete", async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const session = await getLatestSession(userId);
    if (!session) {
      res.status(404).json({ error: "no session to complete" });
      return;
    }
    if (session.turnCount === 0) {
      res.status(409).json({ error: "session has no messages to extract" });
      return;
    }

    // Idempotency vs. evolution:
    //   - If we have a profile and the session is already completed, this is
    //     a replay of /complete on a session that's already been extracted.
    //     Return the existing profile.
    //   - If we have a profile and the session is still active, this is a
    //     CONTINUED onboarding — evolve the existing profile rather than
    //     extract from scratch. Saves a profile_versions row with
    //     trigger="onboarding" (treated like an onboarding extraction since
    //     it came from a transcript).
    //   - If no profile exists, do the initial extraction.
    const existing = await getActiveProfile(userId);

    if (existing && session.status === "completed") {
      res.json({
        sessionId: session.id,
        sessionStatus: "completed",
        profile: existing.profileData,
        version: existing.currentVersion,
        alreadyExtracted: true,
      });
      return;
    }

    let profile;
    let trigger: ProfileTrigger;
    if (existing) {
      profile = await evolveProfileFromTranscript(
        existing.profileData,
        session.messages,
      );
      trigger = "onboarding";
      console.log(
        `[onboarding] continued session — evolved profile (was v${existing.currentVersion})`,
      );
    } else {
      profile = await extractProfile(session.messages);
      trigger = "onboarding";
    }

    const saved = await saveProfile(userId, profile, trigger);

    if (session.status === "active") {
      await markSessionCompleted(session.id);
    }
    await markOnboardingComplete(userId);

    res.json({
      sessionId: session.id,
      sessionStatus: "completed",
      profile: saved.profileData,
      version: saved.currentVersion,
      alreadyExtracted: false,
    });
  } catch (err) {
    next(err);
  }
});

function stripModelTags(text: string): string {
  return text
    .replace(/<analysis>[\s\S]*?<\/analysis>/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<ready\/>/g, "")
    .trim();
}
