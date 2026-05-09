import type { MediaType, TasteProfile } from "@resonance/shared";

export interface WeightChange {
  label: string;
  from: number;
  to: number;
}

export interface FormatComfortChange {
  format: MediaType;
  from: number;
  to: number;
}

export interface ProfileDiff {
  addedThemes: { label: string; weight: number }[];
  removedThemes: string[];
  themeWeightChanges: WeightChange[];
  addedArchetypes: string[];
  removedArchetypes: string[];
  addedAvoidances: string[];
  removedAvoidances: string[];
  addedDislikedTitles: string[];
  removedDislikedTitles: string[];
  addedFormats: MediaType[];
  removedFormats: MediaType[];
  formatComfortChanges: FormatComfortChange[];
  /** Net change to total favorites across all formats — quick signal even
   * when no specific format crossed the comfort threshold. */
  favoritesNetChange: number;
  /** True when the diff is structurally empty — useful for hiding "no
   * material change" entries that are only there because the version row
   * exists (e.g., a manual_edit that touched nothing meaningful). */
  isEmpty: boolean;
}

/**
 * Computes the structural changes from `prev` to `next`. Used by the
 * profile evolution timeline to label what changed in each version
 * deterministically (no AI call required) — interview-defensible because
 * the diff is reproducible from the persisted snapshots alone.
 *
 * Theme weight changes are flagged when they cross a 0.05 threshold so
 * tiny float drift between extractions doesn't generate noise.
 */
export function diffProfiles(
  prev: TasteProfile,
  next: TasteProfile,
): ProfileDiff {
  const prevThemes = new Map(prev.themes.map((t) => [t.label, t]));
  const nextThemes = new Map(next.themes.map((t) => [t.label, t]));
  const addedThemes = next.themes
    .filter((t) => !prevThemes.has(t.label))
    .map((t) => ({ label: t.label, weight: t.weight }));
  const removedThemes = prev.themes
    .filter((t) => !nextThemes.has(t.label))
    .map((t) => t.label);
  const themeWeightChanges: WeightChange[] = [];
  for (const t of next.themes) {
    const prior = prevThemes.get(t.label);
    if (!prior) continue;
    if (Math.abs(t.weight - prior.weight) >= 0.05) {
      themeWeightChanges.push({
        label: t.label,
        from: prior.weight,
        to: t.weight,
      });
    }
  }

  const prevArchLabels = new Set(prev.archetypes.map((a) => a.label));
  const nextArchLabels = new Set(next.archetypes.map((a) => a.label));
  const addedArchetypes = next.archetypes
    .filter((a) => !prevArchLabels.has(a.label))
    .map((a) => a.label);
  const removedArchetypes = prev.archetypes
    .filter((a) => !nextArchLabels.has(a.label))
    .map((a) => a.label);

  const prevAvoid = new Set(prev.avoidances);
  const nextAvoid = new Set(next.avoidances);
  const addedAvoidances = next.avoidances.filter((v) => !prevAvoid.has(v));
  const removedAvoidances = prev.avoidances.filter((v) => !nextAvoid.has(v));

  const prevDisliked = new Set(prev.dislikedTitles ?? []);
  const nextDisliked = new Set(next.dislikedTitles ?? []);
  const addedDislikedTitles = (next.dislikedTitles ?? []).filter(
    (v) => !prevDisliked.has(v),
  );
  const removedDislikedTitles = (prev.dislikedTitles ?? []).filter(
    (v) => !nextDisliked.has(v),
  );

  const prevAffinities = new Map(
    prev.mediaAffinities.map((a) => [a.format, a]),
  );
  const nextAffinities = new Map(
    next.mediaAffinities.map((a) => [a.format, a]),
  );
  const addedFormats: MediaType[] = [];
  const removedFormats: MediaType[] = [];
  const formatComfortChanges: FormatComfortChange[] = [];
  for (const [format, a] of nextAffinities) {
    const prior = prevAffinities.get(format);
    if (!prior) {
      addedFormats.push(format);
      continue;
    }
    if (Math.abs(a.comfort - prior.comfort) >= 0.05) {
      formatComfortChanges.push({
        format,
        from: prior.comfort,
        to: a.comfort,
      });
    }
  }
  for (const format of prevAffinities.keys()) {
    if (!nextAffinities.has(format)) removedFormats.push(format);
  }

  const prevFavCount = prev.mediaAffinities.reduce(
    (n, a) => n + a.favorites.length,
    0,
  );
  const nextFavCount = next.mediaAffinities.reduce(
    (n, a) => n + a.favorites.length,
    0,
  );

  const isEmpty =
    addedThemes.length === 0 &&
    removedThemes.length === 0 &&
    themeWeightChanges.length === 0 &&
    addedArchetypes.length === 0 &&
    removedArchetypes.length === 0 &&
    addedAvoidances.length === 0 &&
    removedAvoidances.length === 0 &&
    addedDislikedTitles.length === 0 &&
    removedDislikedTitles.length === 0 &&
    addedFormats.length === 0 &&
    removedFormats.length === 0 &&
    formatComfortChanges.length === 0 &&
    nextFavCount === prevFavCount;

  return {
    addedThemes,
    removedThemes,
    themeWeightChanges,
    addedArchetypes,
    removedArchetypes,
    addedAvoidances,
    removedAvoidances,
    addedDislikedTitles,
    removedDislikedTitles,
    addedFormats,
    removedFormats,
    formatComfortChanges,
    favoritesNetChange: nextFavCount - prevFavCount,
    isEmpty,
  };
}
