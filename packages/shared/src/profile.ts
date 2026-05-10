import type { MediaType } from "./media.js";

export type Pacing = "slow-burn" | "propulsive" | "variable";
export type Complexity = "layered" | "focused" | "epic";

/** A reference to a specific work the user has engaged with. Used inside
 * `TasteTheme.anchors` / `reinforcedBy` so the UI can render attribution
 * chips with a mediaType icon without ambiguous title-only matching against
 * the library. */
export interface TitleRef {
  title: string;
  mediaType: MediaType;
}

export interface TasteTheme {
  label: string;
  weight: number;
  /** One-sentence designed summary of why this theme resonates. Editorial
   * voice — confident, no stars/scores/parens. The primary display string;
   * `evidence` is legacy. */
  summary?: string;
  /** Primary anchor titles for this theme — the 1-4 works that crystallize
   * it. Rendered as chips alongside the summary. */
  anchors?: TitleRef[];
  /** Reinforcing titles — additional works that support but aren't the
   * primary anchors. Rendered as dimmer chips below or omitted on dense UI.
   * Defaults to `[]`. */
  reinforcedBy?: TitleRef[];
  /** Legacy free-text evidence string from earlier profiles. Kept for
   * backward compat — display surfaces fall back to this when `summary`
   * is empty. New profiles produced after the 2026-05-10 schema change
   * leave this empty. */
  evidence?: string;
}

export interface TasteArchetype {
  label: string;
  attraction: string;
}

export interface NarrativePreferences {
  pacing: Pacing;
  complexity: Complexity;
  tone: string[];
  endings: string;
}

export interface MediaAffinity {
  format: MediaType;
  comfort: number;
  favorites: string[];
}

export interface TasteProfile {
  themes: TasteTheme[];
  archetypes: TasteArchetype[];
  narrativePrefs: NarrativePreferences;
  mediaAffinities: MediaAffinity[];
  avoidances: string[];
  /** Specific titles the user said they DIDN'T like during onboarding or
   * feedback. Distinct from `avoidances`, which holds abstract patterns
   * ("generic chosen-one plots"); this is concrete works to keep out of
   * recommendations entirely.
   *
   * Optional because it was added after some profiles were already persisted —
   * old rows don't have the field. Always read via `?? []`. */
  dislikedTitles?: string[];
}

export type OnboardingStatus = "pending" | "in_progress" | "complete";

export type ProfileTrigger = "onboarding" | "feedback_batch" | "manual_edit";

export interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Closed list of tone descriptors offered in fast-mode onboarding. Long-mode
 * extraction produces free-text tones from the transcript; fast-mode users
 * pick from this menu so the form stays guided. The labels are passed through
 * to `TasteProfile.narrativePrefs.tone` as the user-facing strings below.
 */
export const FAST_TONE_OPTIONS = [
  "bittersweet",
  "mythic",
  "quietly absurd",
  "dread-inflected",
  "earnest",
  "cynical",
  "melancholy",
  "funny",
  "tragic",
  "romantic",
  "stylized",
  "uncanny",
] as const;

export type FastTone = (typeof FAST_TONE_OPTIONS)[number];

export interface FastOnboardingTitleGroup {
  format: MediaType;
  titles: string[];
}

/**
 * Payload for POST /api/onboarding/fast. The form-mode equivalent of a chat
 * transcript — same TasteProfile output downstream, no chat session needed.
 *
 * `enabledFormats` is server-enforced into `mediaAffinities` regardless of
 * which formats appear in `titles` — see CLAUDE.md "format enable/disable is
 * server-enforced".
 */
export interface FastOnboardingFormInput {
  titles: FastOnboardingTitleGroup[];
  pacing: Pacing;
  complexity: Complexity;
  tone: FastTone[];
  endings: string;
  avoidancePatterns: string[];
  dislikedTitles: string[];
  enabledFormats: MediaType[];
}
