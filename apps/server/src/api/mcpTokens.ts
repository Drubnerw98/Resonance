/**
 * MCP token CRUD for the web UI. Clerk-authed (same as every other /api/*
 * router). Lets a signed-in user mint, list, and revoke the Bearer tokens
 * that authenticate their MCP clients into Resonance.
 *
 * The raw token is returned EXACTLY ONCE — on POST. After that the DB holds
 * only the hash, so a leaked or forgotten token cannot be recovered;
 * revoke and re-mint is the only path forward.
 */

import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import {
  TokenNameInUseError,
  listTokens,
  mintToken,
  revokeToken,
} from "../services/mcpTokens.js";
import type { McpTokenRow } from "../db/schema.js";

export const mcpTokensRouter: Router = Router();

mcpTokensRouter.use(requireUser);

const mintBodySchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();

/** Strip the token_hash from API responses — clients never need it, and
 * leaking it would let an attacker who reads a single response brute-force
 * the matching live token offline. */
function sanitize(row: McpTokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

mcpTokensRouter.get("/", async (req, res, next) => {
  try {
    const rows = await listTokens(req.user!.id);
    res.json({ tokens: rows.map(sanitize) });
  } catch (err) {
    next(err);
  }
});

mcpTokensRouter.post("/", async (req, res, next) => {
  try {
    const parsed = mintBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid body", issues: parsed.error.issues });
      return;
    }
    try {
      const { token, rawToken } = await mintToken(
        req.user!.id,
        parsed.data.name,
      );
      // 201 Created. `rawToken` is included on this response ONLY — the
      // client must show + capture it before the user closes the dialog.
      res.status(201).json({ token: sanitize(token), rawToken });
    } catch (err) {
      if (err instanceof TokenNameInUseError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

mcpTokensRouter.delete("/:id", async (req, res, next) => {
  try {
    const flipped = await revokeToken(req.user!.id, req.params.id!);
    // Idempotent: revoking an already-revoked or unknown token is success.
    res.json({ ok: true, revoked: flipped });
  } catch (err) {
    next(err);
  }
});
