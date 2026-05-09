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
