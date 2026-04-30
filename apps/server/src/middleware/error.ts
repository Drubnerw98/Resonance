import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[resonance] unhandled error", err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status) || 500
      : 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(status).json({ error: message });
};
