/**
 * `evaluate_title` — one-shot version of the web app's two-step "would I
 * like X?" flow. The web UI lets the user disambiguate between search hits;
 * agents typically have higher-confidence titles (the user just named the
 * work) so we collapse to: search, take the top hit, score it.
 *
 * Differs from `recommend_media` in two ways the verdict prompt enforces:
 *
 *   - the user has CHOSEN this title (vs. the recommender proposing one),
 *     so the verdict is allowed to be negative — and explicitly addresses
 *     prior negative signal (dislikedTitles, rejected recs) head-on
 *     rather than hiding it;
 *   - status flags (inLibrary, rejectedBefore, etc.) are computed
 *     deterministically from the DB, separate from the model's verdict.
 *
 * One Anthropic call per invocation. Shares the existing evaluate.score
 * rate-limit bucket (100/day).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  evaluateCandidate,
  evaluateSearch,
  type EvaluateResult,
  type EvaluateStatus,
} from "../../services/ai/evaluate.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { logger } from "../../lib/logger.js";
import {
  missingAuthError,
  noProfileError,
  userIdFromCtx,
  type McpToolContext,
} from "../shared.js";

export interface EvaluateTitleOutput {
  matched: {
    title: string;
    mediaType: "movie" | "tv" | "anime" | "manga" | "game" | "book";
    year: number | null;
    externalUrl: string | null;
  };
  /** Normalized to 0-100 for consistency with recommend_media. The
   * underlying verdict schema is 0-1; we multiply at the boundary. */
  matchScore: number;
  verdict: string;
  tasteTags: string[];
  status: EvaluateStatus;
}

/**
 * Map the service-layer EvaluateResult into the MCP response shape.
 * matchScore is normalized from 0-1 → 0-100 for consistency with
 * recommend_media (which returns 0-100). Exported for unit testing — the
 * normalization is the kind of thing that would silently regress.
 */
export function buildEvaluateOutput(
  result: EvaluateResult,
): EvaluateTitleOutput {
  return {
    matched: {
      title: result.candidate.normalizedData.title,
      mediaType: result.candidate.mediaType,
      year: result.candidate.normalizedData.year ?? null,
      externalUrl: result.candidate.normalizedData.externalUrl ?? null,
    },
    matchScore: Math.round(result.verdict.matchScore * 100),
    verdict: result.verdict.verdict,
    tasteTags: result.verdict.tasteTags,
    status: result.status,
  };
}

function formatStatusFlags(status: EvaluateStatus): string[] {
  const flags: string[] = [];
  if (status.inDislikedTitles) flags.push("on your dislikedTitles list");
  if (status.inLibrary) flags.push("already in your library");
  if (status.inSavedRecs) flags.push("saved from a previous batch");
  if (status.rejectedBefore) flags.push("previously skipped or rated 1-2");
  if (status.previouslyRecommended) flags.push("recommended in an earlier batch");
  return flags;
}

function formatSummary(out: EvaluateTitleOutput): string {
  const lines: string[] = [];
  const yr = out.matched.year !== null ? ` (${out.matched.year})` : "";
  lines.push(`${out.matchScore}% match · ${out.matched.title}${yr}`);
  const flags = formatStatusFlags(out.status);
  if (flags.length > 0) {
    lines.push(`Heads-up: ${flags.join("; ")}.`);
  }
  lines.push("");
  lines.push(out.verdict);
  if (out.tasteTags.length > 0) {
    lines.push("");
    lines.push(`Tags: ${out.tasteTags.join(", ")}`);
  }
  if (out.matched.externalUrl) {
    lines.push("");
    lines.push(out.matched.externalUrl);
  }
  return lines.join("\n");
}

const MEDIA_TYPE_VALUES = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
] as const;

export function registerEvaluateTitleTool(server: McpServer): void {
  server.registerTool(
    "evaluate_title",
    {
      title: "Evaluate a specific title",
      description:
        "Give an honest verdict on a specific named work against the authenticated user's taste profile and library. The model is allowed to say no — this is the differentiator from recommend_media (which biases toward inclusion). Returns a matchScore (0-100), a verdict paragraph that explicitly addresses any prior negative signal, taste-tag labels, and deterministic status flags (in-library, previously skipped, on disliked-titles). One Anthropic call per invocation; shared evaluate.score rate-limit bucket.",
      inputSchema: {
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'The work to evaluate (e.g. "The Bear", "Disco Elysium", "No Longer Human"). Top external-API hit is used; ambiguous titles may resolve to the wrong work — be specific (year, subtitle) when in doubt.',
          ),
        mediaType: z
          .enum(MEDIA_TYPE_VALUES)
          .describe("Which format the title is in. Required for disambiguation."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, mediaType }, ctx: McpToolContext): Promise<CallToolResult> => {
      const userId = userIdFromCtx(ctx);
      if (!userId) {
        logger.error({}, "mcp: evaluate_title invoked without userId");
        return missingAuthError();
      }

      try {
        checkRateLimit(userId, "evaluate.score");
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                err instanceof Error
                  ? err.message
                  : "Daily evaluate limit reached.",
            },
          ],
        };
      }

      const hits = await evaluateSearch(mediaType, title, 1);
      const top = hits[0];
      if (!top) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Couldn't find a ${mediaType} matching "${title}". Try a more specific title or check the spelling.`,
            },
          ],
        };
      }

      try {
        const result = await evaluateCandidate(userId, top);
        const output = buildEvaluateOutput(result);
        return {
          content: [{ type: "text", text: formatSummary(output) }],
          structuredContent: output as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: number }).status)
            : 0;
        if (status === 400) return noProfileError();
        logger.error({ err, userId }, "mcp: evaluate_title unexpected error");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Evaluation failed unexpectedly. Try again in a moment.",
            },
          ],
        };
      }
    },
  );
}
