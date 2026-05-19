/**
 * MCP server exposing Resonance's recommendation pipeline as a tool callable
 * by Claude Desktop, Cursor, Goose, and any other MCP-aware agent client.
 *
 * The differentiation from a one-shot Claude session is the same as the web
 * app: every recommendation corresponds to a real `media_cache` row
 * (anti-hallucination guarantee), respects format enable/disable, dedupes
 * against the user's prior recs + watchlist, and cross-references works the
 * user has actually named. We just expose the existing pipeline behind a
 * new transport; the logic stays in `services/ai/recommender.ts`.
 *
 * Auth: per-user Bearer token (see middleware/mcpAuth.ts). The tool reads
 * the validated userId from `extra.authInfo.extra.userId` and scopes the
 * pipeline call to that user — same shape as `req.user.id` in the
 * Clerk-authed routes, different source.
 *
 * Progress: the recommend tool emits four `notifications/progress` events
 * mapping to the pipeline's step boundaries so the agent's UI surfaces
 * motion during the ~60s call instead of looking hung.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { generateRecommendations } from "../services/ai/recommender.js";
import { checkRateLimit } from "../services/rateLimit.js";
import type {
  MediaCacheRow,
  RecommendationBatchRow,
  RecommendationRow,
} from "../db/schema.js";
import { db } from "../db/index.js";
import { recommendations as recsTable } from "../db/schema.js";
import { eq } from "drizzle-orm";

const SERVER_INFO = { name: "resonance-mcp", version: "0.1.0" } as const;

/**
 * Derive the public web URL for `/batches/<id>` deep links. Falls back to a
 * sensible local-dev default if FRONTEND_ORIGIN isn't configured (e.g.
 * `pnpm dev` against the Vite proxy).
 */
function publicFrontendBase(): string {
  const raw = env.FRONTEND_ORIGIN ?? "";
  const first = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  const base = first ?? "http://localhost:5173";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

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
      matchScore: r.matchScore,
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
    lines.push(
      `${r.matchScore}% · ${r.mediaType}${yr} · ${r.title}${xref}`,
    );
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

const ONBOARDING_URL_HINT = "/onboarding/fast";

/**
 * Builds and returns an MCP server with the recommend_media tool registered.
 * Caller is responsible for connecting the server to a transport (typically
 * `StreamableHTTPServerTransport` mounted on /mcp).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO);

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
    async ({ prompt }, extra): Promise<CallToolResult> => {
      const userId =
        (extra.authInfo?.extra as { userId?: string } | undefined)?.userId ??
        null;
      if (!userId) {
        // Belt-and-suspenders — the mcpBearerAuth middleware should always
        // populate this. If we hit this branch, auth is misconfigured.
        logger.error({}, "mcp: tool invoked without authInfo.extra.userId");
        return {
          isError: true,
          content: [
            { type: "text", text: "Authentication context missing." },
          ],
        };
      }
      const startMs = Date.now();
      const progressToken = extra._meta?.progressToken;

      const notifyProgress = async (
        step: number,
        message: string,
      ): Promise<void> => {
        if (progressToken === undefined) return;
        try {
          await extra.sendNotification({
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

      // Step 0 acknowledgement so the agent UI surfaces motion immediately,
      // before the model call inside generateCandidatePlan begins.
      await notifyProgress(0, "Generating candidate plan…");

      try {
        const trimmedPrompt = prompt?.trim();
        const result = await generateRecommendations(userId, {
          ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
          onProgress: (step, message) => {
            // sendNotification returns a Promise; we fire-and-forget here
            // because the pipeline can't await the agent's ack and shouldn't
            // wait. Errors are logged inside notifyProgress.
            void notifyProgress(step, message);
          },
        });

        // Reload the persisted recs with their joined media rows so the
        // response shape can include externalUrl/year/title without a
        // second query per row. The pipeline already wrote everything — we
        // just need the JOIN.
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
        // Friendly text for known user-state failures. The web app maps
        // these to 4xx; here we surface them as MCP tool errors so the
        // agent can route conversationally.
        if (status === 400) {
          const url = `${publicFrontendBase()}${ONBOARDING_URL_HINT}`;
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

  return server;
}
