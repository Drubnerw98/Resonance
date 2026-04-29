import express, { type Express } from "express";
import { clerkMiddleware } from "@clerk/express";
import { onboardingRouter } from "./api/onboarding.js";
import { recommendationsRouter } from "./api/recommendations.js";
import { feedbackRouter } from "./api/feedback.js";
import { profileRouter } from "./api/profile.js";
import { mediaRouter } from "./api/media.js";
import { meRouter } from "./api/me.js";
import { libraryRouter } from "./api/library.js";
import { evaluateRouter } from "./api/evaluate.js";
import { discoverRouter } from "./api/discover.js";
import { errorHandler } from "./middleware/error.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  // Public — no auth required.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Parse Clerk session for everything below. Routes that require a user
  // additionally apply requireUser from middleware/auth.ts.
  app.use(clerkMiddleware());

  app.use("/api/me", meRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use("/api/recommendations", feedbackRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/evaluate", evaluateRouter);
  app.use("/api/discover", discoverRouter);

  app.use(errorHandler);

  return app;
}
