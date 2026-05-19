/**
 * `get_taste_profile` — read-only access to the authenticated user's
 * persistent TasteProfile. Lets an agent ground its reasoning ("based on
 * the user's themes, suggest…") before calling `recommend_media`, or
 * answer meta-questions ("what does the system think I like?") directly.
 *
 * No model call, no rate-limit budget — pure DB read of the same JSONB
 * the web app's /api/profile route returns.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TasteProfile } from "@resonance/shared";
import { db } from "../../db/index.js";
import { recommendations } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { getActiveProfile } from "../../services/profile.js";
import {
  missingAuthError,
  noProfileError,
  publicFrontendBase,
  userIdFromCtx,
  type McpToolContext,
} from "../shared.js";

export interface GetTasteProfileOutput {
  version: number;
  updatedAt: string;
  /** Count of recs the user has acted on (not pending). Useful signal for
   * the agent about how "lived-in" the profile is — a fast-mode user with
   * 0 acted recs has a much thinner profile than one with 50+. */
  actedRecCount: number;
  profile: TasteProfile;
  profileUrl: string;
}

function summarizeProfile(out: GetTasteProfileOutput): string {
  const p = out.profile;
  const themes = p.themes ?? [];
  const archetypes = p.archetypes ?? [];
  const formats = p.mediaAffinities ?? [];
  const avoidances = p.avoidances ?? [];
  const disliked = p.dislikedTitles ?? [];
  const enabledFormats = formats
    .filter((f) => f.format)
    .map((f) => f.format)
    .join(", ");
  const topThemes = themes
    .slice(0, 6)
    .map((t) => t.label)
    .filter(Boolean)
    .join(", ");
  return [
    `Profile v${out.version} · updated ${out.updatedAt.split("T")[0]} · ${out.actedRecCount} acted recs`,
    `Formats: ${enabledFormats || "(none enabled)"}`,
    `Themes (${themes.length}): ${topThemes || "(none yet)"}`,
    `Archetypes: ${archetypes.length}, avoidances: ${avoidances.length}, dislikedTitles: ${disliked.length}`,
    `Full profile snapshot: ${out.profileUrl}`,
  ].join("\n");
}

export function registerGetTasteProfileTool(server: McpServer): void {
  server.registerTool(
    "get_taste_profile",
    {
      title: "Get taste profile",
      description:
        "Read the authenticated user's persistent TasteProfile — themes, archetypes, format affinities, avoidances, and disliked titles — plus its version number, last-updated timestamp, and how many recommendations they've acted on. Use this for grounding before calling recommend_media (especially when the user references their taste obliquely), or to answer meta questions about what the system has learned. No AI cost, no rate-limit budget.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, ctx: McpToolContext): Promise<CallToolResult> => {
      const userId = userIdFromCtx(ctx);
      if (!userId) {
        logger.error({}, "mcp: get_taste_profile invoked without userId");
        return missingAuthError();
      }

      const row = await getActiveProfile(userId);
      if (!row) return noProfileError();

      // Match the /api/profile route — pending recs don't count toward
      // "acted." A fast-mode user with no engagement has 0 here.
      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(recommendations)
        .where(
          and(
            eq(recommendations.userId, userId),
            ne(recommendations.status, "pending"),
          ),
        );

      const output: GetTasteProfileOutput = {
        version: row.currentVersion,
        updatedAt: row.updatedAt.toISOString(),
        actedRecCount: countRow?.value ?? 0,
        profile: row.profileData,
        profileUrl: `${publicFrontendBase()}/profile`,
      };

      return {
        content: [{ type: "text", text: summarizeProfile(output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );
}
