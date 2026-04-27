import { z } from "zod/v4";
import type { TasteProfile } from "@resonance/shared";

// zod schema for the TasteProfile shape Claude must produce. Used both as the
// `output_config.format` for the structured-outputs API call (so Claude is
// constrained at generation time) and as a runtime validator on the parsed
// response (so we never store malformed JSON in the DB).
//
// We use the zod v4 API (imported via `zod/v4`, available in zod 3.25+
// alongside the default v3 API) because the Anthropic SDK's `zodOutputFormat`
// helper imports from `zod/v4` and only accepts v4 schemas — passing a v3
// schema fails with "Cannot read properties of undefined (reading 'def')".
//
// The Anthropic SDK strips numerical-bound constraints (.min/.max) from the
// JSON Schema sent to the model and validates them client-side, so .min(0)
// and .max(1) here are guard rails on our end, not model constraints.

const MediaTypeEnum = z.enum([
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

const ThemeSchema = z.object({
  label: z.string().min(1),
  weight: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

const ArchetypeSchema = z.object({
  label: z.string().min(1),
  attraction: z.string().min(1),
});

const NarrativePrefsSchema = z.object({
  pacing: z.enum(["slow-burn", "propulsive", "variable"]),
  complexity: z.enum(["layered", "focused", "epic"]),
  tone: z.array(z.string().min(1)),
  endings: z.string().min(1),
});

const MediaAffinitySchema = z.object({
  format: MediaTypeEnum,
  comfort: z.number().min(0).max(1),
  favorites: z.array(z.string().min(1)),
});

export const TasteProfileSchema = z.object({
  themes: z.array(ThemeSchema),
  archetypes: z.array(ArchetypeSchema),
  narrativePrefs: NarrativePrefsSchema,
  mediaAffinities: z.array(MediaAffinitySchema),
  avoidances: z.array(z.string().min(1)),
});

// Compile-time check that the zod-inferred type matches the shared interface.
// If the two ever diverge, this assignment fails to typecheck.
const _typecheck: TasteProfile = {} as z.infer<typeof TasteProfileSchema>;
void _typecheck;
