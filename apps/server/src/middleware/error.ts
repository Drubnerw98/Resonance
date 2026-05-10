import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? logger;
  log.error({ err }, "unhandled error");
  const rawStatus =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  const hasStatus = Number.isFinite(rawStatus) && rawStatus > 0;
  const status = hasStatus ? rawStatus : 500;
  // Only echo the message when the throw was deliberately status-coded
  // (user-state error). Bare errors are server faults — message may leak
  // internals (stack traces, ORM payloads, third-party error text).
  const message = hasStatus
    ? err instanceof Error
      ? err.message
      : "Internal server error"
    : "Internal server error";
  res.status(status).json({ error: message });
};
