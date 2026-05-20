# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
  - [2026-05-11 — Past-batches compact rendering on recommendations page](#2026-05-11--past-batches-compact-rendering-on-recommendations-page)
  - [2026-05-11 — Mark un-enrichable library items so they stop retrying](#2026-05-11--mark-un-enrichable-library-items-so-they-stop-retrying)
  - [2026-05-19 — Candidate-plan max_tokens truncates structured output on large libraries](#2026-05-19--candidate-plan-max_tokens-truncates-structured-output-on-large-libraries)
- [Resolved](#resolved)
  - [2026-05-11 — TMDB / external-DB enrichment for watchlist items](#2026-05-11--tmdb--external-db-enrichment-for-watchlist-items-resolved)
  - [2026-05-19 — Sequel-aware cross-references can fabricate anchors](#2026-05-19--sequel-aware-cross-references-can-fabricate-anchors-resolved)
  - [2026-05-19 — Dedup misses Roman-vs-Arabic numeral variants](#2026-05-19--dedup-misses-roman-vs-arabic-numeral-variants-resolved)
  - [2026-05-20 — Split account/settings concerns off /profile into a /settings route](#2026-05-20--split-accountsettings-concerns-off-profile-into-a-settings-route-resolved)
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

### 2026-05-19 — Candidate-plan `max_tokens` truncates structured output on large libraries

**What:** First held-out probe against drub's account (231 library items) failed with `AnthropicError: Failed to parse structured output: Error: Failed to parse structured output as JSON: Unterminated string at position 8667` — the model hit `max_tokens: 2048` in the middle of a "reason" string, returned unparseable JSON, and the recommender crashed. Reliably reproducible on the second attempt (truncated at 9091 on the retry).

**Why noticed:** The held-out eval (`apps/eval`, `pnpm eval --suite heldout`) calls `generateRecommendations` directly. Normal web-flow batches against drub's current library presumably also hit this when triggered — the cap is borderline at ~200 items, and the model's reason verbosity scales with library size as it tries to anchor each suggestion against more anchors.

**Anchors:**

- `apps/server/src/services/ai/recommender.ts` line 568 (the `client.messages.parse({...max_tokens: 2048})` call inside `generateCandidatePlan`)
- `apps/server/src/services/ai/schemas.ts` `CandidatesOutputSchema` (the shape that's getting truncated)

**Fix:** Bumped to `max_tokens: 4096` in the same session — 2x headroom, bounded cost increase. The base schema (15-20 titles + 3-8 queries) lands well under that even with verbose reasons; 4096 should be ample.

**Open questions:**

- Is the truncation happening because the prompt has too many anchors, or because the model is being too thorough in the reasons? If the latter, a prompt-level "reason ≤ 25 words" rule might tighten output and avoid the budget pressure entirely.
- Other model calls in the pipeline (`scoreCandidates` at `max_tokens: 8192`) are less at risk but worth a stress test as the library grows. The eval is the right place to surface this.

## Resolved

### 2026-05-11 — TMDB / external-DB enrichment for watchlist items (resolved)

**What was deferred:** Watchlist rows on `/watchlist` rendered `title · year · source` as plain text — visually thin compared to recs (which already had posters via `media_cache`). Kevin's framing: "if people have a lot of titles on their watchlist it could be bad, maybe import the tmdb data".

**Resolved 2026-05-11 (commits `8f7bc5e`, `3789264`, `197fe7a` on Resonance main):** Schema added nullable `media_cache_id` FK on `library_items` (migration `0010_library_media_cache_link.sql`, applied to prod). New `services/libraryEnrich.ts` dispatches by mediaType through the existing TMDB / IGDB / Jikan / Open Library adapters via `searchAndCacheByTitle`, year-disambiguates the match, and links the FK. Failures are swallowed + logged. `POST /api/library` runs enrichment inline (~300ms one external call) on every manual add / plan-to. `POST /api/library/enrich-batch?status=watchlist` drains un-enriched rows 50 at a time; defaults to `status=watchlist` so a long consumed-library history doesn't starve the watchlist of enrichment budget. Client side: `LibraryItem` shape gains `media: MediaItem | null` from a server-side leftJoin, `WatchlistRow` rewritten to render a `loading="lazy"` poster + linked title + per-format glyph + year/runtime/source + 2-line description. Format-filter tabs above the list (zero-count tabs hide). `/watchlist` auto-fires the drain on first mount when un-enriched rows are present, via a `drainAttempted` ref so the drain refreshing the library between batches doesn't re-fire the effect.

**Anchors:** `apps/server/src/services/libraryEnrich.ts`, `apps/server/src/api/library.ts`, `apps/server/src/db/migrations/0010_library_media_cache_link.sql`, `apps/client/src/pages/WatchlistPage.tsx`, `apps/client/src/hooks/useLibrary.ts`.

### 2026-05-19 — Sequel-aware cross-references can fabricate anchors (resolved)

**What was wrong:** The recommendation scorer could emit a `crossReferences[]` entry citing a title the user never named — e.g. recommending "Hades II" with `{ title: "Hades", reason: "Direct sequel…" }` when "Hades" is nowhere in their library or profile. The model inferred sequel-implies-familiarity. Caught on the eval harness's first run by the `cross-reference-anchored` invariant (1 violation across 23 batches × 153 recs).

**Resolved 2026-05-20:** Both paths from the followup, since they're complementary.

1. **Server-side validation (the real guarantee).** `dropFabricatedCrossReferences` in `recommender.ts` runs after `ScoredCandidatesOutputSchema.parse` inside `scoreCandidates`: it builds the anchor blob and drops any `crossReferences[]` entry whose title isn't findable via `titleAppearsIn`. Drops just the offending entry, not the rec (the followup's preferred call). Because it validates against the same profile used to score the batch, the "stale profile" concern in the followup's second open question doesn't apply to the enforcement path — only to the eval invariant.
2. **Prompt tightening.** Added an explicit anti-fabrication "sequel trap" example to `recommendScore.ts`: recommending a sequel does not license citing a predecessor the user never named.

`buildAnchorBlob` was lifted from `apps/eval/src/invariants.ts` to `packages/shared/src/titleMatch.ts` so the enforcement and the eval invariant share ONE definition of "anchored" — if they drift, the eval gives false confidence. Three unit tests pin the keep / drop-all / drop-only-the-fabricated-entry behavior.

**Anchors:** `apps/server/src/services/ai/recommender.ts`, `apps/server/src/services/ai/prompts/recommendScore.ts`, `packages/shared/src/titleMatch.ts`, `apps/eval/src/invariants.ts`, `apps/server/src/services/ai/recommender.test.ts`.

### 2026-05-19 — Dedup misses Roman-vs-Arabic numeral variants (resolved)

**What was wrong:** `canonicalizeTitle` (`services/ai/titleMatching.ts`) stripped edition suffixes but left numerals untouched, so "Red Dead Redemption II" and "Red Dead Redemption 2" canonicalized differently and within-/cross-batch dedup let both through. Surfaced by the LLM-judge eval (the coarse `simpleCanonicalize` invariant shares the blind spot).

**Resolved 2026-05-20:** Added a Roman→Arabic numeral pass to `canonicalizeTitle`, applied after suffix stripping. Deviated from the followup's suggested ii–v range: normalizes **multi-character** numerals only (ii, iii, iv, vi–xx), skipping single-character I/V/X. Single chars as a standalone title token are far more often a word or character name ("I Am Legend", "V for Vendetta", "Mega Man X") — a blanket V→5 would mis-collapse them. Multi-char-only is both safer on the dangerous cases and broader on the safe ones (catches VII, VIII, IX, XII… that ii–v missed). The `\b`-anchored regex matches whole tokens only. Test pairs pinning the RDR2 + FF7 collapses plus a guard test for single-char non-normalization were added to the `canonicalizeTitle` suite in `recommender.test.ts`; the eval's `simpleCanonicalize` was left coarse-by-design with a comment noting the known miss.

**Anchors:** `apps/server/src/services/ai/titleMatching.ts`, `apps/server/src/services/ai/recommender.test.ts`, `apps/eval/src/canonicalize.ts`.

### 2026-05-20 — Split account/settings concerns off /profile into a /settings route (resolved)

**What was deferred:** `/profile` had accreted four unrelated concerns in one scroll — taste profile + evolution timeline, Library, MCP access tokens, and the Danger zone. drub flagged everything from "Your Library" down as out-of-place. The decision was a new `/settings` route over in-page tabs.

**Resolved 2026-05-20:** New `/settings` route under `RequireAuth`. `SettingsPage` renders `McpTokensSection` + a new self-contained `DangerZone` component (the profile-reset logic lifted verbatim out of `ProfilePage`, with its own `isResetting`/`resetError` state). `McpTokensSection` moved `components/profile/` → `components/settings/`; `DangerZone` lives alongside it. Reached two ways per drub's pick: a "Settings" item in the Clerk `UserButton` dropdown (custom `UserButton.Action` → `navigate("/settings")`, so the primary nav stays at 5 items) and a gear icon-link beside "Edit profile" on `/profile`. Shared `GearIcon` component for both. Taste profile + timeline + Library stay on `/profile`. No code linked `/profile#mcp-tokens`, so no anchor updates were needed. Re-homing the Library to its own `/library` surface remains deferred.

**Anchors:** `apps/client/src/App.tsx`, `apps/client/src/pages/SettingsPage.tsx`, `apps/client/src/pages/ProfilePage.tsx`, `apps/client/src/components/settings/McpTokensSection.tsx`, `apps/client/src/components/settings/DangerZone.tsx`, `apps/client/src/components/shared/GearIcon.tsx`, `apps/client/src/components/shared/Nav.tsx`.

## Abandoned

(items move here when explicitly decided against — note the reason in a one-line addendum so the decision is recoverable)
