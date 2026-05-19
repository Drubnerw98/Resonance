/**
 * Bearer-token auth for MCP clients (Claude Desktop, Cursor, etc.). Distinct
 * path from Clerk: this guards only the /mcp transport. Clerk-authed
 * routes under /api/* keep using the requireUser middleware.
 *
 * The middleware reads `Authorization: Bearer <token>`, validates it via the
 * mcpTokens service, and attaches `req.auth: AuthInfo` so the
 * StreamableHTTPServerTransport can plumb it into tool handlers as
 * `extra.authInfo`. Failed auth returns a JSON-RPC-shaped 401 — most MCP
 * clients display this message verbatim, whereas an Express HTML 401 would
 * surface as an opaque "transport error."
 */

import type { RequestHandler } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyToken } from "../services/mcpTokens.js";
import { logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

const BEARER_PREFIX = "Bearer ";
/** AuthInfo.clientId is the OAuth-spec field name for "which application is
 * making the request." Since we don't run an OAuth client registration flow,
 * every Resonance MCP token is treated as belonging to a single conceptual
 * client; the differentiator is the userId stored in `extra`. */
const CLIENT_ID_LITERAL = "resonance-mcp";

function sendUnauthorized(
  res: Parameters<RequestHandler>[1],
  message: string,
): void {
  res.setHeader("WWW-Authenticate", 'Bearer realm="resonance-mcp"');
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message },
    id: null,
  });
}

export const mcpBearerAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith(BEARER_PREFIX)) {
    sendUnauthorized(
      res,
      "Missing Authorization header. Pass `Authorization: Bearer <token>`.",
    );
    return;
  }

  const rawToken = header.slice(BEARER_PREFIX.length).trim();
  try {
    const verified = await verifyToken(rawToken);
    if (!verified) {
      sendUnauthorized(res, "Token is invalid, revoked, or expired.");
      return;
    }
    // The transport reads req.auth — see StreamableHTTPServerTransport docs.
    // `extra.userId` is what the tool handler reads to scope the call.
    req.auth = {
      token: rawToken,
      clientId: CLIENT_ID_LITERAL,
      scopes: ["recommend", "evaluate", "profile.read"],
      extra: { userId: verified.userId, tokenId: verified.tokenId },
    };
    next();
  } catch (err) {
    logger.error({ err }, "mcp: auth middleware failed");
    sendUnauthorized(res, "Authentication failed.");
  }
};
