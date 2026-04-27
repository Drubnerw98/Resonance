import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { SSEWriter } from "../lib/sse.js";
import {
  appendMessage,
  getLatestSession,
  getOrCreateActiveSession,
  markSessionCompleted,
} from "../services/onboardingSessions.js";
import { streamOnboardingReply } from "../services/ai/onboarding.js";
import { extractProfile } from "../services/ai/extraction.js";
import { getActiveProfile, saveProfile } from "../services/profile.js";
import { markOnboardingComplete } from "../services/users.js";
import type { OnboardingMessage } from "@resonance/shared";

export const onboardingRouter: Router = Router();

onboardingRouter.use(requireUser);

const messageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

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
    const ready = session.messages.some(
      (m) => m.role === "assistant" && m.content.includes("<ready/>"),
    );
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

    const { chunks, done } = streamOnboardingReply(updated.messages);

    for await (const chunk of chunks) {
      if (chunk.text) sse.send("token", { text: chunk.text });
      if (chunk.ready) sse.send("ready", {});
    }

    const { raw, ready } = await done;
    await appendMessage(session.id, { role: "assistant", content: raw });

    if (ready) {
      // Don't auto-complete the session yet — extraction is a separate step.
      // The frontend can offer a "finish onboarding" action that hits
      // POST /complete below.
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

    // Idempotency: if extraction already ran, return the existing profile.
    const existing = await getActiveProfile(userId);
    if (existing) {
      if (session.status === "active") {
        await markSessionCompleted(session.id);
      }
      res.json({
        sessionId: session.id,
        sessionStatus: "completed",
        profile: existing.profileData,
        version: existing.currentVersion,
        alreadyExtracted: true,
      });
      return;
    }

    const profile = await extractProfile(session.messages);
    const saved = await saveProfile(userId, profile, "onboarding");

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
