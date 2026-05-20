/**
 * Title-vs-text fuzzy match used both server-side (in the Constellation
 * /api/profile/export endpoint) and client-side (in the cross-reference
 * evidence modal, to find theme/archetype evidence quotes that mention a
 * given title).
 *
 * Direct normalized substring first, then a 2+ content-token overlap
 * fallback so long titles cited by their short form ("First Law Trilogy
 * ..." matches evidence saying "First Law") still match. The 2-token
 * threshold prevents common words like "the" or "story" from triggering
 * false positives.
 */

import type { TasteProfile } from "./profile.js";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "as", "is", "in", "on", "to",
  "for", "with", "without", "into", "through", "from", "by", "at",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "their", "its", "his", "her", "they", "them", "this", "that", "these",
  "those", "it", "we", "you", "he", "she",
  "who", "whom", "what", "which", "where", "when", "why", "how",
  "own", "not", "no", "yes",
]);

export function titleAppearsIn(title: string, text: string): boolean {
  const titleNorm = normalize(title);
  const textNorm = normalize(text);
  if (titleNorm.length === 0) return false;
  if (textNorm.includes(titleNorm)) return true;

  const titleTokens = contentTokens(titleNorm);
  if (titleTokens.length < 2) return false;
  const textTokens = new Set(contentTokens(textNorm));
  let overlap = 0;
  for (const t of titleTokens) {
    if (textTokens.has(t)) overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function contentTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Concatenates every title-bearing string a user has "named" — library
 * titles plus profile favorites, theme anchors/reinforcedBy/summary/evidence,
 * and archetype attractions — into one newline-joined blob. A cross-reference
 * whose title isn't findable in this blob (via `titleAppearsIn`) was
 * fabricated by the model.
 *
 * Shared so the recommender's pre-persist validation and the eval's
 * `cross-reference-anchored` invariant enforce ONE definition of "anchored";
 * if they drift, the eval gives false confidence.
 */
export function buildAnchorBlob(
  profile: TasteProfile | null,
  libraryTitles: string[],
): string {
  const parts: string[] = [...libraryTitles];
  if (profile) {
    for (const aff of profile.mediaAffinities) {
      for (const fav of aff.favorites) parts.push(fav);
    }
    for (const theme of profile.themes) {
      if (theme.summary) parts.push(theme.summary);
      if (theme.evidence) parts.push(theme.evidence);
      if (theme.anchors) {
        for (const a of theme.anchors) parts.push(a.title);
      }
      if (theme.reinforcedBy) {
        for (const r of theme.reinforcedBy) parts.push(r.title);
      }
    }
    for (const arch of profile.archetypes) {
      parts.push(arch.attraction);
    }
    for (const title of profile.dislikedTitles ?? []) {
      // Disliked titles are negative-signal anchors, but they're still
      // titles the user named — so they count as "named by the user".
      parts.push(title);
    }
  }
  return parts.join("\n");
}
