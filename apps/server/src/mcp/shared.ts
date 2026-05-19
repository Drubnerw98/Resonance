/**
 * Shared helpers used by every MCP tool — URL derivation, auth context
 * extraction, friendly no-profile error response.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { env } from "../env.js";

export type McpToolContext = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
>;

/**
 * Public web URL for `/batches/<id>` and `/onboarding` deep links. Falls back
 * to local dev when FRONTEND_ORIGIN isn't configured (e.g. `pnpm dev` against
 * the Vite proxy).
 */
export function publicFrontendBase(): string {
  const raw = env.FRONTEND_ORIGIN ?? "";
  const first = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  const base = first ?? "http://localhost:5173";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * Pull the validated userId out of the AuthInfo.extra block populated by the
 * Bearer middleware. Returns null if the middleware didn't run or didn't
 * attach a userId — the caller treats that as a misconfig error.
 */
export function userIdFromCtx(ctx: McpToolContext): string | null {
  const extra = ctx.authInfo?.extra as { userId?: string } | undefined;
  return extra?.userId ?? null;
}

/** Friendly "you don't have a profile yet" error — same message across tools
 * so the agent's UX is consistent. */
export function noProfileError(): CallToolResult {
  const url = `${publicFrontendBase()}/onboarding/fast`;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `You don't have a Resonance taste profile yet. Complete the 30-second guided onboarding at ${url} and try again.`,
      },
    ],
  };
}

/** Auth context missing — should only happen on a routing/middleware bug. */
export function missingAuthError(): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: "Authentication context missing." }],
  };
}
