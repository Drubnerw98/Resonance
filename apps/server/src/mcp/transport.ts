/**
 * Express handler that mounts the MCP server on a single route, in stateless
 * mode (a fresh transport per request). Our state lives in Postgres, so
 * there's nothing per-session worth holding in memory — and stateless mode
 * avoids the in-memory transport map that would otherwise need cleanup.
 *
 * Mounted at POST /mcp behind the mcpBearerAuth middleware, which attaches
 * `req.auth: AuthInfo` so the transport plumbs it into tool handler context.
 */

import type { RequestHandler } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createMcpServer } from "./server.js";
import { logger } from "../lib/logger.js";

// The SDK's TS types are not built against `exactOptionalPropertyTypes: true`
// — its constructor option `sessionIdGenerator?: () => string` is set to
// `undefined` explicitly to opt into stateless mode (per the SDK docs), and
// its transport's `onclose` is `() => void | undefined` rather than
// optional-or-omitted. Both fail our strict-mode check. Cast at this single
// boundary; the runtime contract is unchanged.

export const mcpTransportHandler: RequestHandler = async (req, res, next) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
    const server = createMcpServer();
    await server.connect(transport as unknown as Transport);
    // The transport reads `req.auth` and forwards it to tool handlers as
    // `extra.authInfo`. Body has been pre-parsed by the JSON middleware;
    // pass it through to avoid the transport re-reading the stream.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err }, "mcp: transport failed");
    next(err);
  }
};
