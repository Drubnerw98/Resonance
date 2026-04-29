import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
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

/**
 * Lightweight CORS middleware. Inline rather than the `cors` npm package — the
 * surface we need is small (one allowed origin, the auth + content-type
 * headers, credentials). Reads `FRONTEND_ORIGIN` from env; if unset (e.g. in
 * dev where Vite proxies /api same-origin), this is a no-op.
 *
 * Multiple origins via comma-separated `FRONTEND_ORIGIN`. Handles preflight
 * OPTIONS requests by short-circuiting with a 204.
 */
function corsMiddleware() {
  const raw = process.env.FRONTEND_ORIGIN;
  const allowed = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return (req: Request, res: Response, next: NextFunction) => {
    if (allowed.length > 0) {
      const origin = req.headers.origin;
      if (typeof origin === "string" && allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
      }
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function createApp(): Express {
  const app = express();

  app.use(corsMiddleware());
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
