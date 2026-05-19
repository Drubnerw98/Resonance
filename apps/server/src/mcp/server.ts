/**
 * MCP server factory. Exposes Resonance's recommendation pipeline + supporting
 * tools to MCP-aware agent clients (Claude Desktop, Cursor, Goose).
 *
 * Each tool lives in its own file under `mcp/tools/` and is registered here.
 * The recommendation logic itself stays in `services/ai/recommender.ts`,
 * `services/profile.ts`, etc. — this layer owns the protocol surface only.
 *
 * Auth: per-user Bearer token (see middleware/mcpAuth.ts). Tools read the
 * validated userId from `ctx.authInfo.extra.userId` via the shared
 * `userIdFromCtx` helper.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecommendMediaTool } from "./tools/recommend.js";
import { registerGetTasteProfileTool } from "./tools/profile.js";

const SERVER_INFO = { name: "resonance-mcp", version: "0.1.0" } as const;

/**
 * Builds and returns an MCP server with every tool registered. Caller is
 * responsible for connecting the returned server to a transport (typically
 * `StreamableHTTPServerTransport` mounted on /mcp).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerRecommendMediaTool(server);
  registerGetTasteProfileTool(server);
  return server;
}
