/**
 * `list_recent_batches` — read-only access to the user's recent
 * recommendation batches. Lets an agent answer "what have I been exploring
 * lately?" or "did you already give me horror suggestions last week?" and
 * decide whether to call `recommend_media` again or just reference an
 * existing batch.
 *
 * Trimmed compared to the web's /api/recommendations/batches: no cover URLs
 * (agents don't render images), no drop summary (agents don't need the
 * why-not panel). Includes deep-link batchUrl so the agent can hand the
 * user back to the full visual rendering.
 */

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../../db/index.js";
import { recommendationBatches } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import {
  missingAuthError,
  publicFrontendBase,
  userIdFromCtx,
  type McpToolContext,
} from "../shared.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export interface BatchSummary {
  id: string;
  name: string | null;
  prompt: string | null;
  createdAt: string;
  count: number;
  formatCounts: Record<string, number>;
  topTags: string[];
  batchUrl: string;
}

export interface ListRecentBatchesOutput {
  batches: BatchSummary[];
}

/** Row shape the builder accepts — a recommendation_batches row with its
 * recommendations joined and each one's media.mediaType available.
 * Mirrors the shape `db.query.recommendationBatches.findMany({ with: ... })`
 * returns; defined as a public type so the unit test can construct it. */
export interface BatchInput {
  id: string;
  name: string | null;
  prompt: string | null;
  createdAt: Date;
  recommendations: {
    tasteTags: string[] | null;
    matchScore: number;
    media: { mediaType: string };
  }[];
}

/**
 * Aggregate per-batch counts and top-tags from the joined query result.
 * Exported so the unit test can pin the aggregation without touching the
 * DB or the MCP transport layer.
 */
export function buildBatchSummaries(
  rows: BatchInput[],
  base: string,
): BatchSummary[] {
  return rows.map((b) => {
    const formatCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    for (const r of b.recommendations) {
      formatCounts[r.media.mediaType] =
        (formatCounts[r.media.mediaType] ?? 0) + 1;
      for (const t of r.tasteTags ?? []) {
        tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, c]) => c - a)
      .slice(0, 3)
      .map(([t]) => t);
    return {
      id: b.id,
      name: b.name,
      prompt: b.prompt,
      createdAt: b.createdAt.toISOString(),
      count: b.recommendations.length,
      formatCounts,
      topTags,
      batchUrl: `${base}/batches/${b.id}`,
    };
  });
}

function formatSummary(out: ListRecentBatchesOutput): string {
  if (out.batches.length === 0) {
    return "No recommendation batches yet. Call recommend_media to generate the first one.";
  }
  const lines: string[] = [`${out.batches.length} recent batches:`, ""];
  for (const b of out.batches) {
    const label = b.name ?? b.prompt ?? "(unnamed)";
    const formats = Object.entries(b.formatCounts)
      .map(([f, n]) => `${n} ${f}`)
      .join(" · ");
    const tags = b.topTags.slice(0, 3).join(", ");
    const date = b.createdAt.split("T")[0] ?? b.createdAt;
    lines.push(`${date} · ${b.count} recs · "${label}" — ${formats}`);
    if (tags) lines.push(`    tags: ${tags}`);
    lines.push(`    ${b.batchUrl}`);
  }
  return lines.join("\n");
}

export function registerListRecentBatchesTool(server: McpServer): void {
  server.registerTool(
    "list_recent_batches",
    {
      title: "List recent recommendation batches",
      description:
        "List the authenticated user's recent recommendation batches, newest first. Each entry includes its label/prompt, total rec count, per-format breakdown, top taste-tags across the batch, and a deep-link URL. Useful for context (\"have I asked for cozy reads recently?\") or to reference prior work without spending an AI call on a new generation. No AI cost.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(
            `Maximum number of batches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }, ctx: McpToolContext): Promise<CallToolResult> => {
      const userId = userIdFromCtx(ctx);
      if (!userId) {
        logger.error({}, "mcp: list_recent_batches invoked without userId");
        return missingAuthError();
      }

      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const rows = await db.query.recommendationBatches.findMany({
        where: eq(recommendationBatches.userId, userId),
        orderBy: [desc(recommendationBatches.createdAt)],
        limit: effectiveLimit,
        with: {
          recommendations: {
            columns: { tasteTags: true, matchScore: true },
            with: { media: { columns: { mediaType: true } } },
          },
        },
      });

      const batches = buildBatchSummaries(rows, publicFrontendBase());
      const output: ListRecentBatchesOutput = { batches };
      return {
        content: [{ type: "text", text: formatSummary(output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );
}
