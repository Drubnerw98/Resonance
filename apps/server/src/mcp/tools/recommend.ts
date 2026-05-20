/**
 * `recommend_media` — the headline MCP tool. Runs the full 4-step
 * recommendation pipeline against the authenticated user's profile and
 * library, emits progress notifications at each step boundary, and returns
 * a trimmed set of recommendations with the same anti-hallucination,
 * dedup, and format-enforcement guarantees as the web flow.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../../db/index.js";
import {
  recommendations as recsTable,
  type MediaCacheRow,
  type RecommendationBatchRow,
  type RecommendationRow,
} from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { generateRecommendations } from "../../services/ai/recommender.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import {
  missingAuthError,
  noProfileError,
  publicFrontendBase,
  userIdFromCtx,
  type McpToolContext,
} from "../shared.js";

export interface RecommendMediaToolOutputRec {
  title: string;
  mediaType: "movie" | "tv" | "anime" | "manga" | "game" | "book";
  year: number | null;
  matchScore: number;
  explanation: string;
  tasteTags: string[];
  crossReferences: { title: string; reason: string }[];
  externalUrl: string | null;
}

export interface RecommendMediaToolOutput {
  batchId: string;
  batchUrl: string;
  runtimeSeconds: number;
  recommendations: RecommendMediaToolOutputRec[];
  droppedSummary: { count: number; byReason: Record<string, number> };
}

/**
 * Shape the persisted batch + recs into the trimmed MCP response. Drops
 * posters / full synopses (agents don't render them); keeps `externalUrl`
 * for follow-up tool calls or human "open in TMDB" actions. Exported so
 * the unit test can pin the shape without booting the SDK.
 */
export function buildRecommendResponse(
  batch: RecommendationBatchRow,
  recs: Array<RecommendationRow & { media: MediaCacheRow }>,
  startMs: number,
): RecommendMediaToolOutput {
  const base = publicFrontendBase();
  const ordered = [...recs].sort((a, b) => b.matchScore - a.matchScore);
  const dropped = batch.droppedCandidates ?? [];
  const byReason: Record<string, number> = {};
  for (const d of dropped) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
  return {
    batchId: batch.id,
    batchUrl: `${base}/batches/${batch.id}`,
    runtimeSeconds: Number(((Date.now() - startMs) / 1000).toFixed(1)),
    recommendations: ordered.map((r) => ({
      title: r.media.title,
      mediaType: r.media.mediaType,
      year: r.media.normalizedData.year ?? null,
      // matchScore is stored 0-1 (doublePrecision); scale to 0-100 to match
      // the README contract, evaluate_title's output, and how the web
      // MediaCard renders it (Math.round(matchScore * 100)).
      matchScore: Math.round(r.matchScore * 100),
      explanation: r.explanation,
      tasteTags: r.tasteTags ?? [],
      crossReferences: r.crossReferences ?? [],
      externalUrl: r.media.normalizedData.externalUrl ?? null,
    })),
    droppedSummary: { count: dropped.length, byReason },
  };
}

function formatTextSummary(out: RecommendMediaToolOutput): string {
  const lines: string[] = [];
  lines.push(
    `Generated ${out.recommendations.length} recommendations in ${out.runtimeSeconds}s. Full batch: ${out.batchUrl}`,
  );
  if (out.droppedSummary.count > 0) {
    const reasons = Object.entries(out.droppedSummary.byReason)
      .map(([r, n]) => `${n} ${r}`)
      .join(", ");
    lines.push(`(${out.droppedSummary.count} candidates dropped: ${reasons})`);
  }
  lines.push("");
  const top = out.recommendations.slice(0, 10);
  for (const r of top) {
    const yr = r.year !== null ? ` · ${r.year}` : "";
    const xref =
      r.crossReferences.length > 0
        ? ` — because you loved ${r.crossReferences
            .slice(0, 2)
            .map((c) => `"${c.title}"`)
            .join(" + ")}`
        : "";
    lines.push(`${r.matchScore}% · ${r.mediaType}${yr} · ${r.title}${xref}`);
    lines.push(`    ${r.explanation}`);
  }
  if (out.recommendations.length > top.length) {
    lines.push("");
    lines.push(
      `…and ${out.recommendations.length - top.length} more in the batch.`,
    );
  }
  return lines.join("\n");
}

const RECOMMEND_INPUT_SCHEMA = {
  prompt: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional free-text constraint scoping this batch (e.g. 'a movie that'll make me cry', 'cozy fall reads', 'narratively dense games like Disco Elysium'). Omit for a broad mood-agnostic batch.",
    ),
};

export function registerRecommendMediaTool(server: McpServer): void {
  server.registerTool(
    "recommend_media",
    {
      title: "Recommend media",
      description:
        "Generate cross-format media recommendations (movies, TV, anime, manga, games, books) grounded in the authenticated user's persistent taste profile and library. Every result corresponds to a real metadata-API row (anti-hallucination guarantee), respects format enable/disable on the profile, dedupes against prior recs and the watchlist, and includes 0-3 cross-references back to titles the user has actually engaged with. Takes ~30-90 seconds — emits progress notifications at each pipeline step.",
      inputSchema: RECOMMEND_INPUT_SCHEMA,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ prompt }, ctx: McpToolContext): Promise<CallToolResult> => {
      const userId = userIdFromCtx(ctx);
      if (!userId) {
        logger.error({}, "mcp: tool invoked without authInfo.extra.userId");
        return missingAuthError();
      }
      const startMs = Date.now();
      const progressToken = ctx._meta?.progressToken;

      const notifyProgress = async (
        step: number,
        message: string,
      ): Promise<void> => {
        if (progressToken === undefined) return;
        try {
          await ctx.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: step, total: 4, message },
          });
        } catch (err) {
          logger.warn({ err, step }, "mcp: progress send failed");
        }
      };

      try {
        checkRateLimit(userId, "recommendations.generate");
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Daily recommendation limit reached.";
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }

      await notifyProgress(0, "Generating candidate plan…");

      try {
        const trimmedPrompt = prompt?.trim();
        const result = await generateRecommendations(userId, {
          ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
          onProgress: (step, message) => {
            void notifyProgress(step, message);
          },
        });

        const persisted = await db.query.recommendations.findMany({
          where: eq(recsTable.batchId, result.batch.id),
          with: { media: true },
        });

        const output = buildRecommendResponse(
          result.batch,
          persisted,
          startMs,
        );
        return {
          content: [{ type: "text", text: formatTextSummary(output) }],
          structuredContent: output as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: number }).status)
            : 0;
        if (status === 400) return noProfileError();
        if (status === 422) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  err instanceof Error
                    ? err.message
                    : "Pipeline produced no valid candidates.",
              },
            ],
          };
        }
        logger.error({ err, userId }, "mcp: recommend_media unexpected error");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Recommendation pipeline failed unexpectedly. Try again in a moment.",
            },
          ],
        };
      }
    },
  );
}
