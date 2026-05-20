import { and, eq, lt, or } from "drizzle-orm";
import type { TasteProfile } from "@resonance/shared";
import { db } from "../../db/index.js";
import { libraryItems, recommendations } from "../../db/schema.js";

/**
 * Lowercase, strip "The " prefix, strip common edition/cut/remaster suffixes.
 * Two titles that canonicalize to the same string are treated as the same
 * work — collapses "Planescape: Torment" / "Planescape: Torment Enhanced
 * Edition" / "Final Fantasy VII Remastered" / "The Last of Us" / etc.
 */
// Roman → Arabic numerals for sequel-title normalization. Only MULTI-character
// numerals are mapped — single-character "I"/"V"/"X" are skipped because as a
// standalone title token they're far more often a word or character name
// ("I Am Legend", "V for Vendetta", "Mega Man X") than a sequel number. The
// \b-anchored regex matches whole tokens only, so "VII" collapses but the
// "ii" inside "skiing" and the "iv" inside "xiv" never do.
const ROMAN_TO_ARABIC: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xvi: "16",
  xvii: "17",
  xviii: "18",
  xix: "19",
  xx: "20",
};
const ROMAN_NUMERAL_RE = new RegExp(
  `\\b(?:${Object.keys(ROMAN_TO_ARABIC).join("|")})\\b`,
  "g",
);

export function canonicalizeTitle(s: string): string {
  let t = s.toLowerCase().trim();

  // Strip library-cataloging suffixes like "Republic, The" / "Nausea, LA"
  // (where the article or series tag is moved to the end). Apply BEFORE the
  // leading "the " strip so both forms collapse to the same canonical.
  t = t.replace(/,\s*(?:the|a|an|le|la|les|der|die|das)\s*$/i, "");
  t = t.replace(/^the\s+/, "");

  const suffixes: RegExp[] = [
    // "Enhanced Edition", "Premium Edition", "Director's Cut", "Final Cut",
    // "GOTY Edition", "Collector's Edition", etc.
    /\s*[-–—:]?\s*(?:the\s+)?(?:enhanced|definitive|ultimate|complete|gold|special|deluxe|director'?s|final|extended|game of the year|goty|anniversary|premium|collector'?s|standard)\s+(?:edition|cut|version)\s*$/i,
    // "Digital Deluxe" / bare "Deluxe" without "Edition" — common on game
    // store listings (e.g., Planescape Torment ... - Digital Deluxe).
    /\s*[-–—:]?\s*(?:digital\s+)?deluxe\s*$/i,
    /\s*[-–—:]?\s*(?:hd\s+)?remastered\s*$/i,
    /\s*[-–—:]?\s*(?:hd\s+)?remake\s*$/i,
    /\s+\(\d{4}\)\s*$/, // "Title (2017)" disambiguators
  ];
  // Multiple passes to handle stacked suffixes like "Enhanced Edition - Digital Deluxe":
  // first pass strips "- Digital Deluxe", second strips ": Enhanced Edition".
  for (let pass = 0; pass < 3; pass++) {
    const before = t;
    for (const re of suffixes) t = t.replace(re, "");
    if (t === before) break;
  }

  // Collapse Roman-numeral sequels to Arabic so "Red Dead Redemption II" and
  // "Red Dead Redemption 2" canonicalize identically. Runs after suffix
  // stripping; the suffix patterns don't reference numerals, so order is free.
  t = t.replace(ROMAN_NUMERAL_RE, (m) => ROMAN_TO_ARABIC[m] ?? m);

  return t.trim();
}

/** Normalize internal punctuation for loose-equality comparison. Collapses
 * "Planescape Torment" and "Planescape: Torment" to the same shape after
 * suffixes are stripped — they're the same work formatted differently. */
function looseShape(s: string): string {
  return s
    .replace(/[:\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Two separator regexes for the prefix-match check:
//   - sepPunct accepts a punctuation separator (": ", " - ", " & ", etc.).
//     Safe for short prefixes; how subtitles are typically delineated.
//   - sepWhitespace accepts a plain space separator. Catches subtitle
//     patterns like "I am a hero in Osaka" against "I am a hero" — these
//     don't use punctuation. Only applied when the prefix is reasonably
//     long, to keep "Halo" / "Halo Wars" or "X" / "X Men" type cases from
//     falsely merging.
const sepPunct = /^\s*[:\-–—&+,]\s/;
const sepWhitespace = /^\s+\S/;
const SPACE_SEPARATOR_MIN_LENGTH = 8;

/**
 * True if `candidate` matches anything in `known` either by exact canonical
 * match OR by being a `<Known>: <Subtitle>` / `<Known> & <Other>` /
 * `<Known> + <DLC>` / `<Known>, <Subtitle>` variant. Catches:
 *   - DLC names like "Pathologic 2: Marble Nest" → "Pathologic 2"
 *   - Compilation titles like "Planescape: Torment & Icewind Dale" → "Planescape: Torment"
 *   - Bundle titles like "Pathologic 2 + Marble Nest DLC bundle" → "Pathologic 2"
 * The required punctuation separator prevents false matches like "Severance"
 * vs "Severance Pay".
 */
export function matchesKnown(
  candidate: string,
  known: Set<string>,
): boolean {
  const nc = canonicalizeTitle(candidate);
  if (known.has(nc)) return true;

  // Loose-equality: two canonicals that differ only in internal punctuation
  // are the same work. Catches "Planescape Torment" / "Planescape: Torment".
  const ncLoose = looseShape(nc);
  for (const k of known) {
    if (looseShape(k) === ncLoose) return true;
  }

  for (const k of known) {
    // Candidate is the longer variant: "Foo: Bar" matches known "Foo".
    if (k.length >= 5 && nc.length > k.length && nc.startsWith(k)) {
      const tail = nc.slice(k.length);
      if (sepPunct.test(tail)) return true;
      if (k.length >= SPACE_SEPARATOR_MIN_LENGTH && sepWhitespace.test(tail))
        return true;
    }
    // Candidate is the shorter base title: "Foo" matches known "Foo: Bar".
    if (nc.length >= 5 && k.length > nc.length && k.startsWith(nc)) {
      const tail = k.slice(nc.length);
      if (sepPunct.test(tail)) return true;
      if (nc.length >= SPACE_SEPARATOR_MIN_LENGTH && sepWhitespace.test(tail))
        return true;
    }
  }
  return false;
}

/**
 * Titles the user has actively rejected — pulled from three sources:
 *   - rec feedback (explicitly skipped, or rated 1-2 stars),
 *   - library imports rated 1-2 stars,
 *   - profile.dislikedTitles (specific titles named negatively during
 *     onboarding or earlier refinement passes).
 * Used to filter sequels and series variants of disliked works out of every
 * subsequent batch. Saved and 4-5 rated titles are NOT included: positive
 * signal shouldn't block related variants.
 */
export async function collectAvoidTitles(
  userId: string,
  profile: TasteProfile,
): Promise<Set<string>> {
  // From rec feedback: explicitly skipped, or rated 1-2 stars.
  const fromRecs = await db.query.recommendations.findMany({
    where: and(
      eq(recommendations.userId, userId),
      or(
        eq(recommendations.status, "skipped"),
        and(eq(recommendations.status, "rated"), lt(recommendations.rating, 3)),
      ),
    ),
    with: { media: true },
  });
  // From library imports: any item rated 1-2 stars is treated as
  // user-flagged "I watched this and didn't like it".
  const fromLibrary = await db.query.libraryItems.findMany({
    where: and(eq(libraryItems.userId, userId), lt(libraryItems.rating, 3)),
  });
  const set = new Set<string>();
  for (const r of fromRecs) set.add(canonicalizeTitle(r.media.title));
  for (const l of fromLibrary) set.add(canonicalizeTitle(l.title));
  // Profile-level disliked titles: titles the user named negatively during
  // onboarding (e.g. "I really didn't like The Name of the Wind"). The
  // extraction prompt collects these; refinement preserves and extends.
  for (const t of profile.dislikedTitles ?? []) set.add(canonicalizeTitle(t));
  return set;
}
