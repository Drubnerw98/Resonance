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

const MediaTypeEnum = z.enum(["movie", "tv", "anime", "manga", "game", "book"]);

const TitleRefSchema = z.object({
  title: z.string().min(1),
  mediaType: MediaTypeEnum,
});

const ThemeSchema = z.object({
  label: z.string().min(1),
  weight: z.number().min(0).max(1),
  // Editorial copy: one declarative sentence on why this theme resonates,
  // anchored to specific titles. No star ratings, no confidence scores, no
  // semicolon-separated thought chains. Optional at the schema level so
  // profiles persisted before the 2026-05-10 redesign still parse; the
  // prompts enforce emission on every new generation.
  summary: z.string().min(1).optional(),
  // 1-4 anchor titles. Same optional-for-backward-compat reasoning as
  // summary.
  anchors: z.array(TitleRefSchema).min(1).max(4).optional(),
  // 0-8 reinforcing titles. Defaults to [] so the field is always an array
  // at the type level.
  reinforcedBy: z.array(TitleRefSchema).max(8).default([]),
  // Legacy free-text evidence. Required for backward compat with older
  // profile rows; new emissions can leave it empty (default "").
  evidence: z.string().default(""),
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
  // Specific titles the user said they DIDN'T like — distinct from
  // `avoidances` (abstract patterns). `.default([])` lets profiles persisted
  // before this field existed parse without migration.
  dislikedTitles: z.array(z.string().min(1)).default([]),
});

// Compile-time check that the zod-inferred type matches the shared interface.
// If the two ever diverge, this assignment fails to typecheck.
const _typecheck: TasteProfile = {} as z.infer<typeof TasteProfileSchema>;
void _typecheck;

// === Mode 3 schemas: recommendation pipeline ===
//
// Step 1 of the pipeline — the model proposes candidates given a TasteProfile.
// Two output channels:
//   - titleSuggestions: specific titles the model thinks fit. Treated as
//     fuzzy search hints; may not exist in the relevant API.
//   - discoveryQueries: genre-based seeds for /discover-style searches.
//     Keywords were dropped here because the source APIs all use simple
//     title-substring matching for free-text search, which doesn't play well
//     with abstract themes like "psychological interiority". Genre filters
//     are reliable; abstract keywords aren't.
export const CandidatesOutputSchema = z.object({
  // Schema caps are intentionally larger than the prompt's stated targets
  // (15-20 titles, 3-8 queries). Sonnet occasionally overshoots — especially
  // when the avoid-list is long and the model is widening the net to
  // compensate. The schema cap is a safety net, not a hard contract; an
  // off-by-one slip shouldn't blow up the pipeline.
  titleSuggestions: z
    .array(
      z.object({
        title: z.string().min(1),
        mediaType: MediaTypeEnum,
        reason: z.string().min(1),
      }),
    )
    .max(30),
  discoveryQueries: z
    .array(
      z.object({
        mediaType: MediaTypeEnum,
        genres: z.array(z.string().min(1)).min(1),
      }),
    )
    .max(15),
});

export type CandidatesOutput = z.infer<typeof CandidatesOutputSchema>;

// Step 3 of the pipeline — the model scores real candidates we've fetched.
// We give each candidate a sequential string ID ("1", "2", ...) so the model
// doesn't have to round-trip our cache UUIDs; we map back in the orchestrator.
export const ScoredCandidatesOutputSchema = z.object({
  recommendations: z
    .array(
      z.object({
        candidateId: z.string().min(1),
        matchScore: z.number().min(0).max(1),
        explanation: z.string().min(1),
        tasteTags: z.array(z.string().min(1)),
        // 0-3 user-known titles (from the profile's favorites/themes/
        // archetypes/library) the model leaned on when scoring this rec,
        // each with a short rationale. Powers the "because you loved X"
        // chips on the rec card. Optional — older recs/scoring runs that
        // predate this field stay valid; the UI tolerates undefined.
        crossReferences: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              reason: z.string().min(1).max(280),
            }),
          )
          .max(3)
          .optional(),
      }),
    )
    .max(40),
});

export type ScoredCandidatesOutput = z.infer<
  typeof ScoredCandidatesOutputSchema
>;

// === Evaluate mode: single-item verdict ===
//
// "Would I like X?" — model gets one candidate and the user's profile/library,
// outputs a calibrated belief score, a verdict paragraph, and tasteTags. The
// verdict is allowed to be negative; that's the differentiator from the rec
// scoring path which is biased toward inclusion.
export const VerdictOutputSchema = z.object({
  matchScore: z.number().min(0).max(1),
  verdict: z.string().min(1),
  tasteTags: z.array(z.string().min(1)),
});

export type VerdictOutput = z.infer<typeof VerdictOutputSchema>;

// === Mode 4: discovery themes ===
//
// Six browse-mode entry surfaces tailored to the user. Schema cap is 8 to
// give the model a tiny bit of slack; we slice to 6 in the service. Each
// theme is plain text + a list of media types it applies to.
export const DiscoveryThemeSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  formats: z.array(MediaTypeEnum).min(1).max(3),
  promptHint: z.string().min(1).max(300),
});

export const DiscoveryThemesOutputSchema = z.object({
  themes: z.array(DiscoveryThemeSchema).min(1).max(8),
});

export type DiscoveryThemesOutput = z.infer<typeof DiscoveryThemesOutputSchema>;

// === Library item annotation: per-item fitNote + tasteTags ===
//
// One library item at a time → ~1-2 sentence rationale tying that title to
// the user's taste profile, plus a small set of canonical theme/archetype
// labels. Powers Constellation's per-item detail panel and replaces the
// title-substring fallback for cluster placement on annotated items.
//
// Tag validation runs after parse: tasteTags are filtered against the
// profile's known theme/archetype labels (the model occasionally invents
// tags despite being told not to). Empty taste_tags are tolerated downstream.
export const LibraryAnnotationSchema = z.object({
  fitNote: z.string().min(20).max(500),
  tasteTags: z.array(z.string().min(1)).min(1).max(5),
});

export type LibraryAnnotation = z.infer<typeof LibraryAnnotationSchema>;

// === Watchlist decide: rank-from-set ===
//
// "I'm in mood X — what on my watchlist should I tackle?". Like recommendScore,
// the model gets sequential string IDs ("1", "2", ...) for items so it doesn't
// have to round-trip our DB UUIDs; the orchestrator maps back. Output is a
// ranked subset (top picks) with one-line explanations tying each pick to the
// user's mood prompt + their profile/library.
export const WatchlistDecideOutputSchema = z.object({
  picks: z
    .array(
      z.object({
        candidateId: z.string().min(1),
        rank: z.number().int().min(1),
        explanation: z.string().min(1),
      }),
    )
    .max(10),
});

export type WatchlistDecideOutput = z.infer<typeof WatchlistDecideOutputSchema>;
