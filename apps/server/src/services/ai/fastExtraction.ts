import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  FastOnboardingFormInput,
  MediaType,
  TasteProfile,
} from "@resonance/shared";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { fastExtractionSystemPrompt } from "./prompts/fastExtraction.js";
import { TasteProfileSchema } from "./schemas.js";
import { aiTimeoutSignal, withAiTimeout } from "./aiTimeout.js";

const FAST_EXTRACTION_MODEL = ONBOARDING_MODEL;

/**
 * Fast-mode profile extraction. Same TasteProfileSchema output as the
 * conversational `extractProfile`, but the input is a structured form payload
 * rather than a chat transcript.
 *
 * The server overlays `mediaAffinities` against `input.enabledFormats` after
 * the model returns — see CLAUDE.md "format enable/disable is server-enforced".
 * Don't trust the model alone to honor disabled formats.
 */
export async function extractProfileFromForm(
  input: FastOnboardingFormInput,
): Promise<TasteProfile> {
  const client = getAnthropic();

  const userMessage = serializeFormForPrompt(input);

  const format = zodOutputFormat(
    TasteProfileSchema as unknown as Parameters<typeof zodOutputFormat>[0],
  );

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: FAST_EXTRACTION_MODEL,
      max_tokens: 4096,
      system: fastExtractionSystemPrompt(),
      messages: [{ role: "user", content: userMessage }],
      output_config: { format },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(
      `Fast extraction failed: model did not return a parseable profile (stop_reason=${response.stop_reason})`,
    );
  }

  const parsed = TasteProfileSchema.parse(response.parsed_output) as TasteProfile;
  return enforceEnabledFormats(parsed, input);
}

/**
 * Server overlay on the model's mediaAffinities output. Drops entries the
 * user disabled and synthesizes empty entries for enabled formats the model
 * skipped. Doesn't second-guess comfort/favorites the model produced for
 * formats that pass through.
 */
function enforceEnabledFormats(
  profile: TasteProfile,
  input: FastOnboardingFormInput,
): TasteProfile {
  const enabled = new Set<MediaType>(input.enabledFormats);
  const titlesByFormat = new Map<MediaType, string[]>(
    input.titles.map((g) => [g.format, g.titles]),
  );

  const kept = profile.mediaAffinities.filter((a) => enabled.has(a.format));
  const present = new Set(kept.map((a) => a.format));

  for (const format of enabled) {
    if (present.has(format)) continue;
    const titles = titlesByFormat.get(format) ?? [];
    kept.push({
      format,
      comfort: titles.length === 0 ? 0.3 : titles.length <= 2 ? 0.6 : 0.85,
      favorites: titles,
    });
  }

  return { ...profile, mediaAffinities: kept };
}

function serializeFormForPrompt(input: FastOnboardingFormInput): string {
  const titlesBlock =
    input.titles.length === 0
      ? "(none provided)"
      : input.titles
          .filter((g) => g.titles.length > 0)
          .map(
            (g) =>
              `- ${g.format}: ${g.titles.map((t) => `"${t}"`).join(", ")}`,
          )
          .join("\n");

  const tone =
    input.tone.length === 0 ? "(none picked)" : input.tone.join(", ");

  const avoidPatterns =
    input.avoidancePatterns.length === 0
      ? "(none)"
      : input.avoidancePatterns.map((p) => `- ${p}`).join("\n");

  const dislikedTitles =
    input.dislikedTitles.length === 0
      ? "(none)"
      : input.dislikedTitles.map((t) => `- "${t}"`).join("\n");

  const enabledFormats =
    input.enabledFormats.length === 0
      ? "(none)"
      : input.enabledFormats.join(", ");

  return `Here is the user's fast-mode onboarding form. Extract their TasteProfile.

# Titles they love (anchors — these are the most precious signal)
${titlesBlock}

# Narrative shape preferences (their own forced-choice picks)
- pacing: ${input.pacing}
- complexity: ${input.complexity}
- tone: ${tone}
- endings: ${input.endings || "(left blank)"}

# Avoidance patterns
${avoidPatterns}

# Specific titles they disliked
${dislikedTitles}

# Enabled formats (server will hard-filter mediaAffinities to these)
${enabledFormats}
`;
}
