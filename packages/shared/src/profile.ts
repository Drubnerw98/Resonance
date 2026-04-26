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
}

export type OnboardingStatus = "pending" | "in_progress" | "complete";

export type ProfileTrigger = "onboarding" | "feedback_batch" | "manual_edit";

export interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
}