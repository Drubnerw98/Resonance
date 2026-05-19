import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Reassignable handlers per test. The chain shape mirrors how the service
// composes drizzle calls; tests override what each terminal step resolves to.
const insertReturning = vi.fn();
const updateWhere = vi.fn();
const updateReturning = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();

vi.mock("../db/index.js", () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: () => insertReturning() }),
    }),
    update: () => ({
      set: () => ({
        // verifyToken does .update.set.where and `.catch`s a thenable.
        // revokeToken does .update.set.where.returning and `await`s an array.
        // Same chain root, so both paths route through `where()`.
        where: (...args: unknown[]) => {
          const whereResult = updateWhere(...args);
          return {
            then: (
              ok: (v: unknown) => unknown,
              fail?: (e: unknown) => unknown,
            ) => Promise.resolve(whereResult).then(ok, fail),
            catch: (fail: (e: unknown) => unknown) =>
              Promise.resolve(whereResult).catch(fail),
            returning: () => updateReturning(),
          };
        },
      }),
    }),
    query: {
      mcpTokens: {
        findFirst: () => findFirst(),
        findMany: () => findMany(),
      },
    },
  },
}));

import {
  TokenNameInUseError,
  generateRawToken,
  hashToken,
  looksLikeMcpToken,
  mintToken,
  revokeToken,
  tokenDisplayPrefix,
  verifyToken,
} from "./mcpTokens.js";

describe("pure helpers", () => {
  it("generateRawToken: 51 chars, rsn_mcp_ prefix, base64url-safe body", () => {
    const t = generateRawToken();
    expect(t).toMatch(/^rsn_mcp_[A-Za-z0-9_-]{43}$/);
    expect(t).toHaveLength(51);
  });

  it("generateRawToken: distinct outputs (entropy sanity)", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toEqual(b);
  });

  it("hashToken: deterministic 64-char hex", () => {
    const t = "rsn_mcp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const h1 = hashToken(t);
    const h2 = hashToken(t);
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tokenDisplayPrefix: returns first 12 chars", () => {
    const t = generateRawToken();
    expect(tokenDisplayPrefix(t)).toEqual(t.slice(0, 12));
    expect(tokenDisplayPrefix(t)).toMatch(/^rsn_mcp_/);
  });

  it("looksLikeMcpToken: positive on real shape", () => {
    expect(looksLikeMcpToken(generateRawToken())).toBe(true);
  });

  it("looksLikeMcpToken: rejects wrong prefix, wrong length, bad chars", () => {
    expect(looksLikeMcpToken("")).toBe(false);
    expect(looksLikeMcpToken("clerk_token_abc")).toBe(false);
    expect(looksLikeMcpToken("rsn_mcp_short")).toBe(false);
    // Right shape but illegal character.
    expect(
      looksLikeMcpToken(
        "rsn_mcp_!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
      ),
    ).toBe(false);
  });
});

describe("mintToken", () => {
  beforeEach(() => {
    insertReturning.mockReset();
  });

  it("returns the row plus the raw token exactly once", async () => {
    const fakeRow = {
      id: "tok-1",
      userId: "u1",
      name: "Claude Desktop",
      tokenHash: "h",
      tokenPrefix: "rsn_mcp_aaaa",
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    };
    insertReturning.mockResolvedValueOnce([fakeRow]);
    const result = await mintToken("u1", "Claude Desktop");
    expect(result.token).toEqual(fakeRow);
    expect(result.rawToken).toMatch(/^rsn_mcp_/);
  });

  it("maps Postgres unique-violation to TokenNameInUseError", async () => {
    insertReturning.mockRejectedValueOnce(
      Object.assign(new Error("unique violation"), { code: "23505" }),
    );
    await expect(mintToken("u1", "Claude Desktop")).rejects.toBeInstanceOf(
      TokenNameInUseError,
    );
  });

  it("rejects empty / whitespace-only names with status 400", async () => {
    await expect(mintToken("u1", "   ")).rejects.toMatchObject({ status: 400 });
    // No DB call should have been attempted.
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("re-throws unexpected DB errors unchanged", async () => {
    const oddErr = new Error("connection reset");
    insertReturning.mockRejectedValueOnce(oddErr);
    await expect(mintToken("u1", "Claude Desktop")).rejects.toBe(oddErr);
  });
});

describe("verifyToken", () => {
  beforeEach(() => {
    findFirst.mockReset();
    updateWhere.mockReset();
  });

  it("short-circuits to null on malformed input without hitting the DB", async () => {
    const result = await verifyToken("not-a-token");
    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns null for unknown tokens", async () => {
    findFirst.mockResolvedValueOnce(undefined);
    const result = await verifyToken(generateRawToken());
    expect(result).toBeNull();
  });

  it("returns null for revoked tokens", async () => {
    const raw = generateRawToken();
    findFirst.mockResolvedValueOnce({
      id: "tok-1",
      userId: "u1",
      tokenHash: hashToken(raw),
      revokedAt: new Date(),
    });
    const result = await verifyToken(raw);
    expect(result).toBeNull();
  });

  it("returns { userId, tokenId } for live tokens and bumps lastUsedAt", async () => {
    const raw = generateRawToken();
    findFirst.mockResolvedValueOnce({
      id: "tok-1",
      userId: "u1",
      tokenHash: hashToken(raw),
      revokedAt: null,
    });
    updateWhere.mockReturnValueOnce(undefined);
    const result = await verifyToken(raw);
    expect(result).toEqual({ userId: "u1", tokenId: "tok-1" });
    // lastUsedAt update fires (fire-and-forget — we just confirm the chain
    // was invoked, not that we awaited it).
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});

describe("revokeToken", () => {
  beforeEach(() => {
    updateReturning.mockReset();
  });

  it("returns true when a live row was flipped", async () => {
    updateReturning.mockResolvedValueOnce([{ id: "tok-1" }]);
    expect(await revokeToken("u1", "tok-1")).toBe(true);
  });

  it("returns false on unknown or already-revoked tokens (idempotent)", async () => {
    updateReturning.mockResolvedValueOnce([]);
    expect(await revokeToken("u1", "tok-1")).toBe(false);
  });
});
