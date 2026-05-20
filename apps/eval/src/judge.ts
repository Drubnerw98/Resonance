/**
 * LLM-as-judge — the qualitative layer of the eval. A separate model reads
 * the user's taste profile + a generated recommendation and scores the
 * recommendation's *explanation* against a rubric. Catches the failure the
 * deterministic invariants can't: a rec that's structurally valid (real
 * media row, right format, no dupes) but whose stated reasoning is generic,
 * doesn't actually follow from the profile, or over-claims its anchors.
 *
 * Judge model: Opus 4.7 — deliberately a *more capable* model than the
 * Sonnet 4.6 generator. Judging a model with itself (or a weaker model)
 * invites self-grading bias; a stronger judge reduces it. It does not
 * eliminate it — same model family — and the report says so.
 *
 * Cost: one Opus call per judged rec. Bounded by `--n` (default 10) so a
 * judge run lands well under a dollar.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { desc, eq } from "drizzle-orm";
import type { TasteProfile } from "@resonance/shared";
import { env } from "./env.js";
import {
  db,
  recommendationBatches,
  recommendations,
  tasteProfiles,
} from "./db.js";

const JUDGE_MODEL = "claude-opus-4-7";
const DEFAULT_JUDGE_N = 10;

// zod v4 — zodOutputFormat imports zod/v4 internally; see the same cast in
// apps/server/src/services/ai/schemas.ts.
const JudgeVerdictSchema = z.object({
  specificity: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "Does the explanation cite concrete, profile-specific reasons (named themes, archetypes, works) rather than generic praise that could apply to anyone? 0 = pure generic, 5 = tightly profile-specific.",
    ),
  alignment: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "Does the stated reasoning actually follow from this user's profile? A confident explanation that cites the WRONG signal scores low even if it sounds good. 0 = contradicts the profile, 5 = reasoning is sound and well-grounded.",
    ),
  anchoring: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "Are the crossReferences honest and well-chosen — real anchors that genuinely share the claimed quality with the rec? If the rec has no crossReferences, score 3 (neutral). 0 = fabricated/forced anchors, 5 = precise and earned.",
    ),
  overall: z
    .number()
    .min(0)
    .max(5)
    .describe("Holistic quality of this recommendation's explanation."),
  note: z
    .string()
    .min(1)
    .describe("One sentence — the single most useful observation."),
});

type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export interface JudgedRec {
  recId: string;
  title: string;
  mediaType: string;
  matchScore: number;
  verdict: JudgeVerdict;
}

export interface JudgeRunResult {
  userId: string;
  batchId: string;
  batchLabel: string;
  judgedCount: number;
  /** Mean of each rubric dimension across all judged recs. */
  averages: {
    specificity: number;
    alignment: number;
    anchoring: number;
    overall: number;
  };
  recs: JudgedRec[];
}

export interface RunJudgeOptions {
  userId: string;
  /** Specific batch to judge. Defaults to the user's most recent batch. */
  batchId?: string;
  /** Cap on recs judged (cost control). */
  n?: number;
}

function judgeSystemPrompt(): string {
  return [
    "You are a strict evaluator of media-recommendation quality. You will be",
    "given a user's taste profile and one recommendation generated for them.",
    "Score ONLY the recommendation's explanation and cross-references — not",
    "whether you personally would recommend the title.",
    "",
    "The system that generated this rec is supposed to explain every pick in",
    "terms of THIS user's specific taste signals. A good explanation names",
    "concrete themes/archetypes/works from the profile. A bad one is generic",
    "praise ('great character work', 'beautifully crafted') that would fit",
    "any user. Reward specificity and honest reasoning; punish generic filler",
    "and confident-but-wrong logic.",
    "",
    "Be calibrated: 3 is a competent average rec, 5 is genuinely excellent,",
    "0-1 is a real failure. Do not cluster everything at 4.",
  ].join("\n");
}

function judgeUserPrompt(
  profile: TasteProfile,
  rec: {
    title: string;
    mediaType: string;
    explanation: string;
    tasteTags: string[] | null;
    crossReferences: { title: string; reason: string }[] | null;
  },
): string {
  return [
    "# User taste profile",
    JSON.stringify(profile, null, 2),
    "",
    "# Recommendation to evaluate",
    `Title: ${rec.title}`,
    `Format: ${rec.mediaType}`,
    `Explanation: ${rec.explanation}`,
    `Taste tags: ${(rec.tasteTags ?? []).join(", ") || "(none)"}`,
    "Cross-references:",
    rec.crossReferences && rec.crossReferences.length > 0
      ? rec.crossReferences
          .map((c) => `  - "${c.title}": ${c.reason}`)
          .join("\n")
      : "  (none)",
    "",
    "# Task",
    "Score this recommendation's explanation against the rubric.",
  ].join("\n");
}

export async function runJudge(
  options: RunJudgeOptions,
): Promise<JudgeRunResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "judge suite requires ANTHROPIC_API_KEY in the environment",
    );
  }
  const n = options.n ?? DEFAULT_JUDGE_N;

  const profileRow = await db.query.tasteProfiles.findFirst({
    where: eq(tasteProfiles.userId, options.userId),
  });
  if (!profileRow) {
    throw new Error(`user ${options.userId} has no taste profile`);
  }

  // Resolve the target batch — explicit, or the user's most recent.
  const batch = options.batchId
    ? await db.query.recommendationBatches.findFirst({
        where: eq(recommendationBatches.id, options.batchId),
      })
    : await db.query.recommendationBatches.findFirst({
        where: eq(recommendationBatches.userId, options.userId),
        orderBy: [desc(recommendationBatches.createdAt)],
      });
  if (!batch) {
    throw new Error(
      options.batchId
        ? `batch ${options.batchId} not found`
        : `user ${options.userId} has no batches to judge`,
    );
  }

  const recRows = await db.query.recommendations.findMany({
    where: eq(recommendations.batchId, batch.id),
    with: { media: true },
    orderBy: [desc(recommendations.matchScore)],
    limit: n,
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const judged: JudgedRec[] = [];

  for (const rec of recRows) {
    const response = await client.messages.parse({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      system: judgeSystemPrompt(),
      messages: [
        {
          role: "user",
          content: judgeUserPrompt(profileRow.profileData, {
            title: rec.media.title,
            mediaType: rec.media.mediaType,
            explanation: rec.explanation,
            tasteTags: rec.tasteTags,
            crossReferences: rec.crossReferences,
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(
          JudgeVerdictSchema as unknown as Parameters<
            typeof zodOutputFormat
          >[0],
        ),
      },
    });
    if (!response.parsed_output) {
      throw new Error(
        `judge call returned no parsed output (stop_reason=${response.stop_reason})`,
      );
    }
    const verdict = JudgeVerdictSchema.parse(response.parsed_output);
    judged.push({
      recId: rec.id,
      title: rec.media.title,
      mediaType: rec.media.mediaType,
      matchScore: rec.matchScore,
      verdict,
    });
  }

  const mean = (pick: (v: JudgeVerdict) => number): number => {
    if (judged.length === 0) return 0;
    const sum = judged.reduce((acc, j) => acc + pick(j.verdict), 0);
    return Number((sum / judged.length).toFixed(2));
  };

  return {
    userId: options.userId,
    batchId: batch.id,
    batchLabel: batch.name ?? batch.prompt ?? "(unnamed batch)",
    judgedCount: judged.length,
    averages: {
      specificity: mean((v) => v.specificity),
      alignment: mean((v) => v.alignment),
      anchoring: mean((v) => v.anchoring),
      overall: mean((v) => v.overall),
    },
    recs: judged,
  };
}
