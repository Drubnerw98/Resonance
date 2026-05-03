# Constellation Export — implementation plan

A scoped Resonance-side project to make `/api/profile/export` a clean, structured, per-item-annotated source of truth for [Constellation](https://github.com/Drubnerw98/Constellation) (taste-visualization companion) and any future portfolio consumer.

## Why this exists

Constellation visualizes the user's profile as a force-directed map: themes are cluster centers, titles are stars positioned by primary theme, edges connect titles that share themes/archetypes. It currently consumes `/api/profile/export` and renders ~13 nodes for an active user — **too sparse to read as a constellation**.

Three structural problems with the current export shape:

1. **Library items have no per-item AI annotation.** Constellation tries to determine cluster membership by substring-matching titles against `profile.themes[i].evidence`. This works for short titles cited verbatim ("Aftersun", "Paterson") and fails on long titles ("The Assassination of Jesse James by the Coward Robert Ford"). It also fails for any library item not explicitly mentioned in evidence text. Result: most library items either dump at canvas center or get dropped.

2. **`mediaAffinities[].favorites` is invisible.** A user's profile contains ~25-30 favorites (extracted from onboarding conversation: "what shows have you loved?"). These never get inserted into `library_items` — they live only in the profile JSONB as flat title strings. They are the cleanest possible taste signal (the user explicitly said "I love this") and they are referenced verbatim throughout theme/archetype evidence. Constellation never sees them today.

3. **Avoidances + dislikedTitles are also invisible.** Profile carries them but `/export` doesn't surface them. A "taste portrait" benefits from showing what's *outside* the constellation, not just inside.

## What success looks like

After this project ships:

- `/api/profile/export` returns a fully structured, per-item-annotated payload that Constellation can render directly with no fallback heuristics.
- Manual library items each carry a 1-2 sentence AI rationale (`fitNote`) and structured `tasteTags` matching canonical theme/archetype labels.
- Imported library items are still excluded from the export (as they are today). No per-import AI cost.
- Favorites become first-class export items — the cheapest density win available, no AI cost.
- Avoidances + dislikedTitles ship as a structured negative-space layer.
- Active user with ~10 manual library items + ~5 recs + ~25 favorites + ~6 avoidances → ~45 export items, all cluster-tagged.

The annotations also become useful **inside Resonance**: the recommender can read `library_items.fit_note` and `taste_tags` as additional per-item context when scoring future candidates, instead of re-deriving each time. Win-win.

## Scope

### In scope
- New `library_items.fit_note` and `library_items.taste_tags` columns
- AI annotation service for manual library items (skip imports)
- Backfill script for existing manual items
- `/api/profile/export` extension: pass new library fields through, derive favorites + avoidances from profile JSONB

### Out of scope (deferred)
- Per-import annotation (cost: ~$0.001 × 1600 imports = $1.60 per user — bounded but not worth it for low-signal data)
- Caching layer / `profile_exports` snapshot table — premature, current latency is fine
- Per-theme `tagline` short-form field — would help compact UI but defer until Constellation actually needs it
- Async annotation queue — start with inline annotation on library write; add queue if blocking the POST becomes a UX issue

## Phase 1 — Library item annotation

### Schema migration

```sql
-- migrations/<n>_library_item_annotation.sql
ALTER TABLE library_items
  ADD COLUMN fit_note text,
  ADD COLUMN taste_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN annotated_at_profile_version integer;
```

`annotated_at_profile_version` lets us detect stale annotations after profile refinement (lazy regen — see "Cache invalidation" below). The migration is additive and reversible.

### New service: `apps/server/src/services/ai/libraryAnnotation.ts`

```ts
export interface LibraryAnnotation {
  fitNote: string;     // 1-2 sentences, item-specific
  tasteTags: string[]; // canonical theme + archetype labels from the profile
}

export async function annotateLibraryItem(
  userId: string,
  libraryItemId: string,
): Promise<LibraryAnnotation>;
```

Behavior:
1. Load the library item (`title`, `mediaType`, `year`, `rating`, `source`).
2. **If source !== "manual", throw** — caller bug. Imports never get annotated.
3. Load the user's active profile (`getActiveProfile`).
4. Send to AI with the prompt sketched below.
5. Validate output against a Zod schema.
6. Persist `fit_note`, `taste_tags`, and `annotated_at_profile_version = profile.current_version`.

### Prompt sketch

System prompt should match the style + model used elsewhere in `services/ai/` (Sonnet, structured JSON output via the existing pattern). The user portion:

```
You are annotating one item from a user's media library against their existing taste profile.

PROFILE:
{ JSON: profile.themes (label + evidence), profile.archetypes (label + attraction),
  profile.narrativePrefs }

LIBRARY ITEM:
- Title: {title}
- Format: {mediaType}
- Year: {year ?? "n/a"}
- User's rating: {rating ?? "unrated"}

Return JSON matching this schema:
{
  "fitNote": "1-2 sentences explaining why THIS specific title fits THIS specific profile.
              Refer to the title and the user's pattern; do NOT generically restate the
              theme. The fitNote should be useful in a UI surface that shows ONE title
              at a time.",
  "tasteTags": ["array of 1-4 theme labels and/or archetype labels, taken VERBATIM from
                the profile, that this title exemplifies. Don't invent new labels."]
}
```

Zod schema:

```ts
import { z } from "zod";

export const LibraryAnnotationSchema = z.object({
  fitNote: z.string().min(20).max(500),
  tasteTags: z.array(z.string().min(1)).min(1).max(5),
});
```

Tag validation: after parsing, filter `tasteTags` to only those that exact-match an entry in `profile.themes[].label ∪ profile.archetypes[].label`. Drop unknowns silently — the AI occasionally invents.

### Wire into POST /api/library

Where the user adds a manual library item:

```ts
const item = await insertLibraryItem(userId, { ...input, source: "manual" });
// Inline annotation. Adds ~4-6s to the response. If this becomes a UX
// problem, move to a job queue and let the client poll.
if (item.source === "manual" && item.status === "consumed") {
  const annotation = await annotateLibraryItem(userId, item.id);
  await db
    .update(libraryItems)
    .set({
      fitNote: annotation.fitNote,
      tasteTags: annotation.tasteTags,
      annotatedAtProfileVersion: profileRow.currentVersion,
    })
    .where(eq(libraryItems.id, item.id));
}
```

**Filter on the row, not the route.** Bulk imports happen via several paths
(`POST /api/library/import` for CSV/XML, `POST /api/library/import-steam`),
and `addLibraryItem` itself accepts a `source` override. The reliable signal
is the row's `source` column, not which handler ran.

**Watchlist items skip annotation.** A "fit note" presupposes the user has
experienced the work. For `status === "watchlist"` (plan-to-consume), ship
with `fit_note: null, taste_tags: []` — Constellation's existing
title-substring fallback (`graph.ts:147 themesForLibraryTitle`) positions
them by evidence-text matching, same as today.

Imports (`status` either way, but `source !== "manual"`) skip annotation entirely.

### Backfill script

`apps/server/src/scripts/backfillLibraryAnnotations.ts`:

- Find all `library_items` where `source = 'manual' AND fit_note IS NULL`.
- For each, call `annotateLibraryItem`. Sequential is fine (this is a one-time op; rate-limit yourself anyway to respect the AI provider).
- Log per-item; on failure, leave the row alone and continue.

Run as `pnpm tsx apps/server/src/scripts/backfillLibraryAnnotations.ts`. Don't add to deploy automation — this is opt-in.

### Cache invalidation

When `saveProfile` runs (profile refinement), library annotations become potentially stale (themes may have shifted). Strategy: **lazy regen on read in `/export`**.

```ts
// In /api/profile/export library mapping:
if (item.annotatedAtProfileVersion !== profile.currentVersion) {
  // Annotation predates current profile — regenerate.
  // Either: regen inline (slow on big libraries); or:
  // Mark as stale and ship the old fitNote anyway (acceptable for v1).
}
```

Recommendation: **ship stale annotations in v1**. The fitNote rarely becomes wrong after refinement — themes shift gradually. Add a background regen later if drift becomes noticeable.

### Cost

Sonnet 4.6 (`ONBOARDING_MODEL`) on a trimmed payload (themes + archetypes only,
~2-3K input tokens, ~150-300 output tokens):

- Per-item: ~$0.010-0.015
- Backfill for typical user (5-15 manual items): ~$0.05-0.20 once
- Power user (20+ manual items): ~$0.20-0.30 once
- Going forward: per-add → cents/month

Bounded. Trim the prompt payload to themes + archetypes — `narrativePrefs`
adds tokens for no signal (it doesn't drive cluster tags), and including
`mediaAffinities[].favorites` while annotating an item that's itself a
favorite creates a self-referential loop.

## Phase 2 — Extend `/api/profile/export`

### New response shape

```ts
interface ProfileExport {
  profile: TasteProfile;        // unchanged
  library: ExportedLibraryItem[];
  recommendations: ExportedRecommendation[];
  favorites: ExportedFavorite[];     // NEW
  avoidances: ExportedAvoidance[];   // NEW
}

interface ExportedLibraryItem {
  id: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  rating: number | null;
  // Synthetic constant — the DB row's source is "manual" (imports already
  // filter out before this map), but the export label has been "library"
  // since the endpoint shipped and Constellation's type already pins it.
  // Don't break the contract for a renamed string.
  source: "library";
  fitNote: string | null;        // NEW — populated for manual+consumed items post-Phase-1
  tasteTags: string[];           // NEW — same; empty for watchlist items
  status: "consumed" | "watchlist"; // NEW — lets Constellation render watchlist nodes differently
}

interface ExportedRecommendation {
  id: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  matchScore: number;
  status: RecommendationStatus;
  rating: number | null;
  tasteTags: string[];
  explanation: string;           // already added in commit eb716c1
}

// Derived from profile.mediaAffinities[].favorites — flatten across all
// formats. Themes/archetypes determined by case-insensitive substring match
// against profile.themes[].evidence and profile.archetypes[].attraction.
// No AI cost.
interface ExportedFavorite {
  title: string;
  mediaType: MediaType;
  themes: string[];      // canonical theme labels this title appears in evidence for
  archetypes: string[];  // canonical archetype labels this title appears in attraction for
}

// Two kinds of avoidance — pattern-level ("Mary Sue protagonists who face
// no real cost") and title-level ("Pathologic 2"). Surface both, kind-tagged.
interface ExportedAvoidance {
  description: string;
  kind: "pattern" | "title";
}
```

### Endpoint changes

In `apps/server/src/api/profile.ts`, the `/export` handler:

1. Library mapping: include `fitNote`, `tasteTags`, and `status` from the row. Keep the existing `source === "manual"` filter and the synthetic `source: "library"` output literal.
2. Recommendations: unchanged (`explanation` already shipped).
3. **New: derive favorites.** Iterate `profile.mediaAffinities`; for each affinity, iterate `favorites: string[]`. For each title:
   - Set `mediaType = affinity.format`.
   - Compute `themes` by filtering `profile.themes` for entries whose normalized `evidence` includes the normalized title.
   - Compute `archetypes` by filtering `profile.archetypes` similarly against `attraction`.
   - Emit `{ title, mediaType, themes, archetypes }`.
4. **New: derive avoidances.** Map `profile.avoidances` to `{ description, kind: "pattern" }` and `profile.dislikedTitles` to `{ description, kind: "title" }`. Concat.

Normalize helper (lift from Constellation's graph builder if useful):

```ts
const normalize = (s: string) =>
  s.trim().toLowerCase().replace(/[-_/]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
```

### Why favorites?

For a typical user, this single change is the biggest density win available:

- ~25-30 favorite titles, all written into the profile by the AI during onboarding extraction
- Every favorite is referenced verbatim in theme evidence (the AI cites them as examples when defining themes), so substring matching produces clean cluster tags
- Zero AI cost — pure structural derivation from existing JSONB
- Solves Constellation's "13 nodes is too sparse" complaint without changing the recommender or asking the user to engage more

After dedupe with `library_items` (favorites and library can overlap — e.g., "First Law Trilogy" appears in both for the test user), expect ~20-25 unique favorites added to the export.

## Phase 3 — Theme tagline (DEFERRED)

Not implementing yet, but flagging for future:

- Add `profile.themes[i].tagline: string` — a 4-8 word abstract summary of the theme. The current `label` is already a sentence fragment ("earned sacrifice through sustained commitment"); a tagline would be the still-shorter form for compact UI ("earned sacrifice").
- Generate during `services/ai/profile.ts` profile generation — extend the existing extraction prompt.
- Backfill via batch over existing profiles.

Defer until Constellation's UI specifically asks for it. Long labels work fine in detail-panel context; they only hurt in cluster-label hover/legend areas where text wraps.

## Open decisions for the implementer

1. **Annotation timing on add: inline vs queue?**
   - Inline blocks the POST `/api/library` response by ~1-2s.
   - Queue (e.g., write to DB, fire-and-forget annotation, expose `annotation_status: "pending" | "ready"`) is more complex but better UX.
   - Recommendation: **inline for v1.** A library-add is already an explicit "I want this saved with rationale" action — a 1-2s wait is acceptable for the value.

2. **What happens during the brief window after Phase 1 ships but before the backfill runs?**
   - Existing manual items have `fit_note: null`, `taste_tags: []`.
   - Constellation will render them as today (themes via title-substring fallback). No regression.
   - Run the backfill within minutes of the migration to close the gap.

3. **Should `recommendations.explanation` be included in the type even if some old rows lack it?**
   - The column is `notNull`, so no — every row should have one.
   - Constellation's API client treats it as nullable for paranoia. Safe.

## Implementation order

1. Migration + service + Zod schema (Phase 1 plumbing)
2. Wire into POST /api/library, write tests
3. Run backfill script in dev → verify quality of generated annotations on real profiles
4. Deploy to Render → run backfill on prod
5. Phase 2 endpoint extension (favorites + avoidances + library new fields)
6. Coordinate with Constellation: bump types, render new fields

Total estimated time: **6-10 hours** depending on how thorough the prompt iteration is.

## Cost summary

| Surface | One-time | Per-add |
|---|---|---|
| Backfill manual library | $0.02-0.06 / user | — |
| New manual library item | — | $0.002-0.004 |
| Favorites/avoidances | $0 (derivation) | $0 |
| Profile generation | unchanged | unchanged |

For a power user with 20+ manual library items, total backfill stays under $0.10. The recommender cost is unchanged.

## What Constellation will do with this

(Documenting the consumer side so the implementer knows what to optimize for.)

- `library[i].fitNote` → renders in the detail panel under "Why this fits" (currently only recs have this)
- `library[i].tasteTags` → drives cluster membership directly, replacing today's brittle title-substring matching
- `favorites` → rendered as additional nodes (different visual treatment optional — possibly a slight glow/halo to denote "explicit favorite"), cluster-tagged via `themes` + `archetypes`
- `avoidances` → rendered as a separate "anti-stars" layer below the main constellation, or as desaturated/dashed nodes — visualizes negative space in the user's taste

Constellation will dedupe across `library`, `recommendations`, and `favorites` by normalized title (favorites that are also recs or library items are skipped from the favorites list). The order of preference for which "version" of a duplicated title wins is `recommendation > library > favorite` since recs have the richest annotation.

---

Questions or design concerns: drub. Constellation repo: `Drubnerw98/Constellation`. Most relevant files to read on the consumer side before changing the server contract: `src/lib/api.ts`, `src/lib/graph.ts`, `src/types/profile.ts`.
