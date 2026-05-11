# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
  - [2026-05-11 — TMDB / external-DB enrichment for watchlist items](#2026-05-11--tmdb--external-db-enrichment-for-watchlist-items)
  - [2026-05-11 — Past-batches compact rendering on recommendations page](#2026-05-11--past-batches-compact-rendering-on-recommendations-page)
- [Resolved](#resolved)
- [Abandoned](#abandoned)

## Active

### 2026-05-11 — TMDB / external-DB enrichment for watchlist items

**What:** Watchlist rows on `/watchlist` currently render `title · year · source` and nothing else. Recs already get rich metadata via `media_cache` (poster image, plot, runtime, external links) at score time; watchlist items skip this because they're plan-to-consume, not actively recommended. With a long watchlist this reads thin — no posters, no plot blurb, no way to differentiate a remembered title from a stale one.

**Why noticed:** Surfaced during Kevin's UX pass on 2026-05-11. Kevin's framing: "if people have a lot of titles on their watchlist it could be bad, maybe import the tmdb data". The pick-for-me / mark-watched / rate work shipped in the same session; this is the fourth quadrant of that feedback that needed server work and was deferred.

**Anchors:**

- `apps/server/src/api/library.ts` (add path + steam-import path — where watchlist items land)
- `apps/server/src/services/mediaCache.ts` (the existing enrichment surface — would be the source of truth)
- `apps/server/src/db/schema.ts` (library_items table — needs an optional `media_cache_id` link or denormalized poster fields)
- `apps/client/src/pages/WatchlistPage.tsx` (`WatchlistRow` — current rendering surface)

**What's been considered:**

- Backfill-on-add: when a library item is created with `status="watchlist"`, fire a background lookup against the same enrichment pipeline recs use. Cache the result on the library row.
- Lazy enrichment: only enrich when the user actually opens the watchlist page; first-fetch hits the cache, subsequent fetches are fast.
- Imported-watchlists (Letterboxd, Goodreads, MAL) can be hundreds of items — enrichment cost is real. The pipeline already has per-user daily rate limits; this would compete with rec generation.
- Display-side fallback: even without backfill, the watchlist row could lazy-fetch a single TMDB search result client-side on render. Cheap, but adds latency to every page open.

**Shape of work:** Server: extend the library `add` path to look up media metadata via the existing aggregator and write the result onto the row (or store a media_cache_id). Decide whether to do this synchronously (slow add) or as a job (added complexity but better UX). Client: render poster + brief plot/runtime line. Backfill migration for existing watchlist items optional — could run lazily as users open the page. Estimate: a day's work, mostly because of the design call between sync / job / lazy.

**Open questions:**

- Sync, job, or lazy? Each has tradeoffs and is one decision to make in `decisions.md`-style language.
- Imported-watchlists are the dominant volume. Do we backfill them eagerly (cost on import time) or on first watchlist-page open?
- Posters or just text metadata first? Posters are the highest visual gain but add bytes and require image hosting trust.

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

## Resolved

(items move here when ticketed and shipped, or fixed inline — keep for historical context, prune when the file gets long)

## Abandoned

(items move here when explicitly decided against — note the reason in a one-line addendum so the decision is recoverable)
