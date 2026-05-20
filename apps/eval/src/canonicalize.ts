/**
 * Deliberately simple title canonicalizer for the eval's dedup invariant.
 *
 * The recommender has a much more elaborate canonicalizer in
 * services/ai/titleMatching.ts that handles edition suffixes, year tags,
 * series variants, etc. The eval intentionally uses a different — and
 * weaker — definition so that the invariant catches the *coarse* case
 * (two rows with the same title literal modulo case and the leading "the").
 * The system's canonicalizer should make any collision the eval catches
 * also collide system-side; a finding here means the recommender's
 * canonicalizer let something slip.
 *
 * Known coarse miss: this does NOT normalize Roman-vs-Arabic numerals (the
 * system canonicalizer does), so "Game II" / "Game 2" duplicates slip past
 * the within-batch dedup invariant — by design; the LLM-judge layer is the
 * backstop for those.
 */
export function simpleCanonicalize(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
