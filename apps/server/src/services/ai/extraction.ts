import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { OnboardingMessage, TasteProfile } from "@resonance/shared";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { extractionSystemPrompt } from "./prompts/extraction.js";
import { profileRefinementSystemPrompt } from "./prompts/profileRefinement.js";
import { TasteProfileSchema } from "./schemas.js";
import { aiTimeoutSignal, withAiTimeout } from "./aiTimeout.js";

const EXTRACTION_MODEL = ONBOARDING_MODEL;

/**
 * Mode 2: extract a structured TasteProfile from a full onboarding transcript.
 *
 * Single non-streaming call. The transcript is sent verbatim — including the
 * assistant's hidden <analysis>/<thinking> blocks — because those running
 * notes are signal the model should leverage when synthesizing.
 *
 * Output is constrained by zod schema (server-side validation) and structured-
 * outputs mode on the API (model-side constraint). If Claude refuses, the
 * `parsed_output` is null and we throw.
 */
export async function extractProfile(
  history: OnboardingMessage[],
): Promise<TasteProfile> {
  const client = getAnthropic();

  const transcript = history
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join("\n\n---\n\n");

  // SDK type-vs-runtime mismatch: helpers/zod.d.ts imports ZodType from `zod`
  // (v3) but helpers/zod.js imports `zod/v4`. The runtime only works with v4
  // schemas — the .d.ts is wrong. Cast through `unknown` to pass our v4
  // schema in; revisit when the SDK fixes its type declarations.
  const format = zodOutputFormat(
    TasteProfileSchema as unknown as Parameters<typeof zodOutputFormat>[0],
  );

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: extractionSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `Here is the full onboarding transcript. Extract the user's taste profile.\n\n---\n\n${transcript}`,
        },
      ],
      output_config: { format },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(
      `Extraction failed: model did not return a parseable profile (stop_reason=${response.stop_reason})`,
    );
  }

  // The SDK helper's `parse` callback runs our v4 schema's safeParse on the
  // model output, so the runtime shape matches TasteProfile — but its return
  // type was inferred through the `unknown` cast above, so we re-validate
  // here both for type assertion and as a defense-in-depth check.
  return TasteProfileSchema.parse(response.parsed_output) as TasteProfile;
}

/**
 * Evolve an existing TasteProfile using a new onboarding transcript. Unlike
 * `extractProfile` (which builds from scratch), this preserves the user's
 * existing taste DNA and updates it based on what they said in the new
 * conversation. Used by the "Continue onboarding" flow — successive sessions
 * sharpen the profile rather than overwriting it.
 *
 * Reuses the refinement system prompt (same "evolve, don't rebuild" framing
 * as feedback-driven refinement) but with a transcript instead of feedback
 * items.
 */
export async function evolveProfileFromTranscript(
  current: TasteProfile,
  history: OnboardingMessage[],
): Promise<TasteProfile> {
  const client = getAnthropic();

  const transcript = history
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join("\n\n---\n\n");

  const format = zodOutputFormat(
    TasteProfileSchema as unknown as Parameters<typeof zodOutputFormat>[0],
  );

  const userMessage = `# Current TasteProfile

${JSON.stringify(current, null, 2)}

# New conversation transcript (a continuation of the previous onboarding)

${transcript}

Evolve the profile based on what was said in this new conversation. Treat the new transcript as additional signal, not a replacement. Keep what's still true; sharpen what's been clarified; add what's new.`;

  const response = await withAiTimeout(() =>
    client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: profileRefinementSystemPrompt(),
      messages: [{ role: "user", content: userMessage }],
      output_config: { format },
      signal: aiTimeoutSignal(),
    }),
  );

  if (!response.parsed_output) {
    throw new Error(
      `Profile evolution failed: model did not return a parseable profile (stop_reason=${response.stop_reason})`,
    );
  }
  return TasteProfileSchema.parse(response.parsed_output) as TasteProfile;
}
