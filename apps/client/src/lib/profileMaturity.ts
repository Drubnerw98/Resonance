import type { TasteProfile } from "@resonance/shared";

export interface ProfileMaturity {
  isMature: boolean;
  /** Short label describing maturity state — used for the badge text. */
  summary: string;
  /** Action hint shown alongside the badge, when relevant. */
  suggestion: string | null;
}

/**
 * Cheap heuristic for "is this profile fleshed out enough to give strong
 * recs, or is it still forming?" Used to decide whether to show the
 * "still forming · feedback sharpens it" badge on /profile and
 * /recommendations.
 *
 * Two paths to maturity:
 *   1. Rich profile out of the gate (4+ themes, 2+ archetypes, 6+ favorites).
 *      Long-mode users typically land here on first onboarding.
 *   2. Modest profile + accumulated feedback (3+ themes AND 8+ acted-on recs).
 *      Fast-mode users start thin but reach maturity through the
 *      auto-refinement loop after a couple feedback batches.
 *
 * Below both thresholds → "forming." The badge nudges the user toward
 * feedback (the only thing that closes the gap) and sets expectations that
 * the first batch may be weaker than later ones.
 */
export function computeProfileMaturity(
  profile: TasteProfile,
  actedRecCount: number,
): ProfileMaturity {
  const totalFavorites = profile.mediaAffinities.reduce(
    (n, a) => n + a.favorites.length,
    0,
  );

  const richProfile =
    profile.themes.length >= 4 &&
    profile.archetypes.length >= 2 &&
    totalFavorites >= 6;

  const evolvedThroughFeedback =
    profile.themes.length >= 3 && actedRecCount >= 8;

  if (richProfile || evolvedThroughFeedback) {
    return {
      isMature: true,
      summary: "Profile is well-formed",
      suggestion: null,
    };
  }

  // Tailor the suggestion so the user knows what specifically would help.
  let suggestion: string;
  if (actedRecCount === 0) {
    suggestion = "Rate or save a few recs to sharpen it.";
  } else if (actedRecCount < 5) {
    suggestion = "Keep rating recs — your profile evolves automatically.";
  } else {
    suggestion = "A few more rated recs and your profile auto-refines.";
  }

  return {
    isMature: false,
    summary: "Profile is still forming",
    suggestion,
  };
}
