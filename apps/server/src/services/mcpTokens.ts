/**
 * Per-user API tokens authenticating MCP clients (Claude Desktop, Cursor,
 * etc.) into a Resonance user's account. Different auth path from Clerk —
 * Clerk gates the web app at /api/*; these gate the MCP server at /mcp.
 *
 * Token shape:
 *   `rsn_mcp_<43 chars base64url>` = 51 chars total. The `rsn_mcp_` prefix
 *   makes a stray token recognizable in a logfile or commit diff. The 32
 *   random bytes give ~256 bits of entropy.
 *
 * Storage:
 *   SHA-256 hex of the raw token (a fast hash is fine because the input is
 *   high-entropy random — bcrypt's slow-hash design is for low-entropy
 *   passwords). The raw value is returned exactly once at mint time and
 *   never persisted. A short plaintext prefix is stored separately so the
 *   management UI can identify which token is which without revealing it.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { mcpTokens, type McpTokenRow } from "../db/schema.js";
import { logger } from "../lib/logger.js";

const TOKEN_PREFIX = "rsn_mcp_";
const TOKEN_RANDOM_BYTES = 32;
/** First N chars of the raw token, shown in the management UI. Enough to
 * disambiguate ("the one starting rsn_mcp_a1b2"), nowhere near enough to
 * brute-force the rest. */
const TOKEN_DISPLAY_PREFIX_LEN = TOKEN_PREFIX.length + 4;
const MAX_NAME_LEN = 80;

export class TokenNameInUseError extends Error {
  constructor(name: string) {
    super(`A token named "${name}" already exists for this account.`);
    this.name = "TokenNameInUseError";
  }
}

// ---- Pure helpers (testable without DB) ----

/** Generate a fresh raw token. Returns the full string the user pastes into
 * their MCP client config — never persist this value as-is. */
export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function tokenDisplayPrefix(raw: string): string {
  return raw.slice(0, TOKEN_DISPLAY_PREFIX_LEN);
}

/** Cheap structural check used before hitting the DB on verify. Catches the
 * common case of "user pasted random garbage" without a query. */
export function looksLikeMcpToken(raw: string): boolean {
  if (!raw.startsWith(TOKEN_PREFIX)) return false;
  // rsn_mcp_ + 43 chars b64url (32 bytes, no padding) = 51 chars.
  if (raw.length !== TOKEN_PREFIX.length + 43) return false;
  return /^[A-Za-z0-9_-]+$/.test(raw.slice(TOKEN_PREFIX.length));
}

// ---- Service functions ----

export interface MintResult {
  token: McpTokenRow;
  /** Raw token. Returned once; never re-derivable. The caller must hand this
   * to the user immediately and not log it. */
  rawToken: string;
}

export async function mintToken(
  userId: string,
  name: string,
): Promise<MintResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) {
    const err: Error & { status?: number } = new Error(
      `Token name must be 1-${MAX_NAME_LEN} characters.`,
    );
    err.status = 400;
    throw err;
  }

  const rawToken = generateRawToken();
  try {
    const [row] = await db
      .insert(mcpTokens)
      .values({
        userId,
        name: trimmed,
        tokenHash: hashToken(rawToken),
        tokenPrefix: tokenDisplayPrefix(rawToken),
      })
      .returning();
    if (!row) throw new Error("token insert returned no row");
    return { token: row, rawToken };
  } catch (err) {
    // Postgres unique-violation on the partial (user_id, name) live index.
    // Surface a typed error so the route handler can map to 409.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw new TokenNameInUseError(trimmed);
    }
    throw err;
  }
}

export interface VerifyResult {
  userId: string;
  tokenId: string;
}

/**
 * Validate a raw token and return the user it belongs to. On success, bumps
 * `lastUsedAt` so the management UI can show inactivity. Returns null for
 * every kind of failure (malformed, unknown, revoked) — the MCP auth
 * middleware maps that to a single 401 without leaking which case it was.
 */
export async function verifyToken(
  rawToken: string,
): Promise<VerifyResult | null> {
  if (!looksLikeMcpToken(rawToken)) return null;
  const hash = hashToken(rawToken);

  const row = await db.query.mcpTokens.findFirst({
    where: eq(mcpTokens.tokenHash, hash),
  });
  if (!row || row.revokedAt !== null) return null;

  // Defense-in-depth: the DB lookup is already by hash, so this comparison
  // should always pass. timingSafeEqual is here to short-circuit any future
  // bug where we accidentally do a partial-match query and lean on string
  // compare for the final check.
  const expected = Buffer.from(row.tokenHash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  // Best-effort lastUsedAt bump. If it fails (e.g. transient DB blip), we
  // still return success — auth shouldn't fail because we couldn't write a
  // diagnostic timestamp.
  db.update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))
    .catch((err: unknown) => {
      logger.warn({ err, tokenId: row.id }, "mcp: lastUsedAt update failed");
    });

  return { userId: row.userId, tokenId: row.id };
}

/** List the user's tokens, newest first. Includes revoked rows so the UI can
 * show an audit trail — the route handler / view decides whether to filter. */
export async function listTokens(userId: string): Promise<McpTokenRow[]> {
  return db.query.mcpTokens.findMany({
    where: eq(mcpTokens.userId, userId),
    orderBy: [desc(mcpTokens.createdAt)],
  });
}

/**
 * Revoke a token. Filters by userId in the WHERE clause (defense-in-depth
 * against a future routing bug that bypasses requireUser) and returns
 * whether a live row was actually flipped. Idempotent: revoking an
 * already-revoked or unknown token returns false without throwing.
 */
export async function revokeToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const result = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        eq(mcpTokens.userId, userId),
        sql`${mcpTokens.revokedAt} IS NULL`,
      ),
    )
    .returning({ id: mcpTokens.id });
  return result.length > 0;
}
