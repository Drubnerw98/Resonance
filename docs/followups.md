# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
  - [2026-05-11 — Past-batches compact rendering on recommendations page](#2026-05-11--past-batches-compact-rendering-on-recommendations-page)
  - [2026-05-11 — Mark un-enrichable library items so they stop retrying](#2026-05-11--mark-un-enrichable-library-items-so-they-stop-retrying)
  - [2026-05-19 — Sequel-aware cross-references can fabricate anchors](#2026-05-19--sequel-aware-cross-references-can-fabricate-anchors)
- [Resolved](#resolved)
  - [2026-05-11 — TMDB / external-DB enrichment for watchlist items](#2026-05-11--tmdb--external-db-enrichment-for-watchlist-items-resolved)
- [Abandoned](#abandoned)

## Active

### 2026-05-11 — Past-batches compact rendering on recommendations page

**What:** Kevin's batch-level layout idea on the recs page wasn't fully picked up. The implemented toggle is Grid vs One-at-a-time (doomscroll) per drub's pick. Kevin's adjacent suggestion was: latest batch renders as full MediaCards, *past* batches collapse to a compact row (same shape as the /batches page list) with a per-batch "expand" button. This would let the recs page act as both the active feed AND the historical archive without scrolling through pages of old full-cards.

**Why noticed:** Kevin's full quote, paraphrased: "the ones I just asked for can be the big lads, the past one should be the 'list', and you can expand them if you want to look at them as big lads". The current implementation only differentiates by view mode globally — there's no notion of "latest is full, past is compact" within the same view.

**Anchors:**

- `apps/client/src/pages/RecommendationsPage.tsx` (the `grouped.map(...)` loop that renders one `BatchSection` per batch)
- `apps/client/src/components/recommendations/BatchSection.tsx` (would need a `collapsed` prop and a compact-row rendering branch)
- `apps/client/src/pages/BatchesPage.tsx` (the existing compact-row layout — could be lifted to a shared `BatchRowCompact` component)

**Shape of work:** Lift the compact row from BatchesPage into a shared component. Teach BatchSection to render either the full grid or the compact row based on a `collapsed` boolean. Default `collapsed=false` for the FIRST batch in `grouped`, `collapsed=true` for the rest. Per-batch toggle to expand a compact row to full cards. Probably a half-session of work. Decide whether this interacts with the view-mode toggle (e.g., in doomscroll mode, maybe everything stays full because doomscroll IS the focus mode).

**Open questions:**

- How does this compose with the existing view-mode toggle (Grid vs One-at-a-time)? Either it's orthogonal (collapse-past applies in both modes) or it only applies in Grid mode.
- Is "first batch" defined as "newest in time" (current chronological order) or "the one just generated this session"? The latter requires tracking session state; the former is easier and probably fine.

### 2026-05-11 — Mark un-enrichable library items so they stop retrying

**What:** When `enrichLibraryItem` runs an adapter lookup that returns zero hits (rare title, obscure indie game, year ambiguity), the row stays with `media_cache_id = null`. Every subsequent `/watchlist` visit re-fires the drain, which picks up the same row in its `isNull(mediaCacheId)` filter and re-runs the same lookup. The lookup re-fails, we re-log the warn, the row stays un-enriched. Per-user this is bounded by page visits; across many users with niche items in their watchlists it could become a meaningful chunk of wasted TMDB / Jikan / IGDB / Open Library budget.

**Why noticed:** Surfaced during the post-ship audit of watchlist enrichment on 2026-05-11. drub asked whether the auto-drain could hurt performance long-term; the answer is mostly no, but this retry-on-every-visit pattern is the one small inefficiency worth a follow-up if scale reveals it.

**Anchors:**

- `apps/server/src/services/libraryEnrich.ts` (`enrichLibraryItem`, `enrichLibraryItemsForUser`)
- `apps/server/src/db/schema.ts` (`libraryItems` — would gain a new timestamp column)

**Shape of work:** Add a nullable `media_cache_enrich_tried_at: timestamp` column on `library_items`. When `enrichLibraryItem` returns from the adapter with zero hits (or the adapter call throws), set this timestamp. Drain SQL gets an additional clause: `OR media_cache_enrich_tried_at IS NULL OR media_cache_enrich_tried_at < NOW() - INTERVAL '7 days'`. Successful enrichments leave the column null since `media_cache_id` is set. Tiny migration, three-line code change. Estimate: 30 min.

**Open questions:**

- Retry interval — 7 days feels right (catches new TMDB entries within a week of release without thrashing). Could be longer if we want to be conservative.
- Should manual user action ("re-enrich this row") be exposed? Probably not until users actually ask.

### 2026-05-19 — Sequel-aware cross-references can fabricate anchors

**What:** First run of the eval harness (`apps/eval`, `pnpm eval`) flagged a real cross-ref fabrication. Rec `7c88c090…` (Hades II) shipped with `crossReferences: [{ title: "Hades", reason: "Direct sequel that deepens the themes of the original — if Zagreus' story landed…" }]` but "Hades" doesn't appear anywhere in the user's library or profile (no favorite, no theme evidence, no archetype attraction, no dislikedTitle). The model inferred sequel-implies-familiarity rather than anchoring to a title the user actually named — the same failure mode the cross-ref rule is supposed to prevent.

**Why noticed:** The `cross-reference-anchored` invariant in `apps/eval/src/invariants.ts` walks every persisted batch and checks each `crossReferences[].title` against `titleAppearsIn` of the user's full anchor blob. 23 batches × 153 recs gave one violation — caught on the first run.

**Anchors:**

- `apps/server/src/services/ai/prompts/recommendScore.ts` (the scoring prompt that emits crossReferences)
- `apps/server/src/services/ai/recommender.ts` `scoreCandidates` (~line 762)
- `apps/server/src/services/ai/schemas.ts` `ScoredCandidatesOutputSchema` (the crossReferences shape)

**Shape of work:** Two paths, not mutually exclusive.

1. **Tighten the prompt.** The current cross-ref rule says "title must come from the user's library, mediaAffinities favorites, or theme.evidence / archetype.attraction." Add an explicit anti-fabrication example using the sequel-of-rec case ("if you're recommending Hades II and the user has never named Hades, do NOT cite Hades as the anchor"). Worked good/bad examples are how every other prompt failure mode in this repo got fixed.
2. **Server-side validation.** After scoring, run the same `titleAppearsIn` check the eval uses; drop any unanchored `crossReferences[]` entries before persistence. Belt-and-suspenders against future model regressions. ~10 lines.

**Open questions:**

- Should the validation drop the whole rec or just the unanchored xref entry? Dropping just the entry preserves the rec; dropping the whole rec is more conservative but loses signal. Lean toward dropping the entry.
- The eval currently checks against the user's CURRENT profile. Profiles evolve — a rec made against an older profile that had "Hades" in it would now fail the invariant after the user edited Hades out. For accuracy we'd want to use the profile_version closest to the batch's createdAt. Worth the complexity if false-positive rate grows.

## Resolved

### 2026-05-11 — TMDB / external-DB enrichment for watchlist items (resolved)

**What was deferred:** Watchlist rows on `/watchlist` rendered `title · year · source` as plain text — visually thin compared to recs (which already had posters via `media_cache`). Kevin's framing: "if people have a lot of titles on their watchlist it could be bad, maybe import the tmdb data".

**Resolved 2026-05-11 (commits `8f7bc5e`, `3789264`, `197fe7a` on Resonance main):** Schema added nullable `media_cache_id` FK on `library_items` (migration `0010_library_media_cache_link.sql`, applied to prod). New `services/libraryEnrich.ts` dispatches by mediaType through the existing TMDB / IGDB / Jikan / Open Library adapters via `searchAndCacheByTitle`, year-disambiguates the match, and links the FK. Failures are swallowed + logged. `POST /api/library` runs enrichment inline (~300ms one external call) on every manual add / plan-to. `POST /api/library/enrich-batch?status=watchlist` drains un-enriched rows 50 at a time; defaults to `status=watchlist` so a long consumed-library history doesn't starve the watchlist of enrichment budget. Client side: `LibraryItem` shape gains `media: MediaItem | null` from a server-side leftJoin, `WatchlistRow` rewritten to render a `loading="lazy"` poster + linked title + per-format glyph + year/runtime/source + 2-line description. Format-filter tabs above the list (zero-count tabs hide). `/watchlist` auto-fires the drain on first mount when un-enriched rows are present, via a `drainAttempted` ref so the drain refreshing the library between batches doesn't re-fire the effect.

**Anchors:** `apps/server/src/services/libraryEnrich.ts`, `apps/server/src/api/library.ts`, `apps/server/src/db/migrations/0010_library_media_cache_link.sql`, `apps/client/src/pages/WatchlistPage.tsx`, `apps/client/src/hooks/useLibrary.ts`.

## Abandoned

(items move here when explicitly decided against — note the reason in a one-line addendum so the decision is recoverable)
