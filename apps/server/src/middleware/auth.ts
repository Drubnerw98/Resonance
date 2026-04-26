import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { ensureUser } from "../services/users.js";
import type { User } from "../db/schema.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Reject the request if Clerk hasn't authenticated it, then ensure a local
 * users row exists and attach it as req.user. Downstream handlers can rely on
 * req.user being present.
 */
export const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    if (!auth.userId) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    req.user = await ensureUser(auth.userId);
    next();
  } catch (err) {
    next(err);
  }
};
