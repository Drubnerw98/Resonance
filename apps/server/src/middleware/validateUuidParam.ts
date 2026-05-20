import type { RequestParamHandler } from "express";

// 8-4-4-4-12 hex. Loose on the version/variant nibbles — matches anything
// Postgres's `uuid` type will accept, so the guard never rejects an id the
// DB would have taken.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `value` is a syntactically valid UUID string. */
export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Express `router.param` callback that 400s a request whose route parameter
 * isn't a valid UUID, before it reaches a handler that would pass it into a
 * `uuid`-typed column comparison. Without this, a malformed id reaches
 * Postgres, which throws a type-cast error that surfaces as an opaque 500.
 *
 * Register once per param name on each router:
 *   router.param("id", validateUuidParam);
 */
export const validateUuidParam: RequestParamHandler = (
  _req,
  res,
  next,
  value,
) => {
  if (isUuid(value)) {
    next();
    return;
  }
  res.status(400).json({ error: "invalid id" });
};
