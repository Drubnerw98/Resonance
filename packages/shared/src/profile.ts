import type { MediaType } from "./media.js";

export type Pacing = "slow-burn" | "propulsive" | "variable";
export type Complexity = "layered" | "focused" | "epic";

export interface TasteTheme {
  label: string;
  weight: number;
  evidence: string;
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
