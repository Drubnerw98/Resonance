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