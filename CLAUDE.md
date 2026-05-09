# CLAUDE.md — working notes for Resonance

This is the working-rules file: how to work in this repo, what state it's in, and the user's preferences. **Architecture lives in [ARCHITECTURE.md](./ARCHITECTURE.md)** — read that for design decisions and subsystem details. **README.md** is the public-facing front page.

## What this is

Cross-format media recommender (movies, TV, anime, manga, games, books) built around a persistent "taste DNA" profile. Portfolio project targeting dev jobs at startups / agencies. The differentiator from a one-shot Claude session: structured persistence, library cross-references, verification against real metadata APIs, multi-tenancy.

## Current state

**Deployed and live:**

- Frontend: `https://resonance-client.vercel.app` (Vercel, static SPA)
- Backend: `https://resonance-server-t4r8.onrender.com` (Render free tier — spins down after 15 min idle, ~30s cold start)
- DB: Neon Postgres
- Auth: Clerk (dev instance, `pk_test_…`)

**Shipped:**

- All four AI modes (onboarding, extraction + refinement, recommendation pipeline, discovery themes) + evaluate verdicts
- Fast-mode onboarding (`POST /api/onboarding/fast`) — guided form alternative to the long chat. Same `TasteProfile` output, server-overlaid `mediaAffinities` from enabled-formats. Linked from the chat starter card as the "short on time?" escape hatch.
- First-batch auto-fire — both `/onboarding/complete` and `/onboarding/fast` start a `recommendations.generate` job in the background when the user's first profile is created. New users land on `/recommendations` with the loading pulse already running instead of an empty state. Skipped on continued onboarding (existing profile evolved further).
- Cold-start visibility toast — `apiFetch` fires a `resonance:slow-fetch` event after 3s; `<ColdStartToast/>` in `Layout.tsx` shows a one-time-per-page-load warning so the Render free-tier ~30s cold start doesn't look like a hung request.
- Profile maturity badge — `computeProfileMaturity(profile, actedRecCount)` heuristic on `/profile` and `/recommendations` shows a "still forming · feedback sharpens it" nudge while the profile is thin (relevant especially for fast-mode users). Hides once mature.
- Persistent batches with name / prompt / refine flow (stack new batches on existing ones with extra constraints)
- Library imports: Letterboxd CSV, Goodreads CSV, MyAnimeList XML, Steam Web API
- Watchlist (plan-to-consume) on library_items + plan-to status on rec cards — both feed dedup, neither feeds cross-references
- Manual profile editor (every field), format enable/disable hard enforcement
- Per-user daily rate limits on AI-bound endpoints (in-memory, daily UTC reset)
- Mobile nav (hamburger), iOS Safari focus auto-zoom fix, branded 404, friendly missing-profile empty states
- Sort dropdown on recommendations (match% / alphabetical / year asc/desc)
- Auto-refinement banner when feedback PATCH crosses the threshold
- Save + rate visually independent (rated 4★ + saved coexist)
- Signed-out landing page (hero / how-it-works / differentiator / format showcase / closing CTA)

**Deferred (intentional):**

- Postgres-backed jobs (only matters at multi-instance scale)
- Custom domain + production Clerk instance (`pk_live_…`)
- Test coverage beyond `streaming.test.ts` smoke test
- Profile version rollback UI (history is stored)
- Recent-evaluations history (substantial backend feature)
- Wishlist via Steam (Valve deprecated the public endpoint; would need user OAuth)

## Working preferences (the user, drub)

These are how the user prefers to collaborate. Honor them by default unless explicitly redirected.

**Communication shape:**

- Brief responses. State what's about to happen, run the work, summarize what changed. No padding.
- One clean update at meaningful checkpoints, not running narration.
- Greenlights are short (`"yeah do it"`, `"send it"`, `"go"`). Don't ask for re-confirmation when you've already laid out the plan.
- No emojis in regular communication.

**Engineering judgment:**

- Push back when you disagree. The user explicitly invites it (`"if you disagree feel free, it's not gospel"`). Saying yes to bad ideas is worse than friction.
- Triage before doing on multi-item lists: what you'll do, what you'll skip, what's already shipped. Catches duplicate work and design-review-from-an-old-screenshot situations.
- If something feels bigger than the user thinks, say so honestly. The user respects scope honesty over forced optimism.
- Quality > speed for AI features. When the user says `"don't sacrifice quality"` they mean it — don't propose Haiku swaps for cost savings.

**Workflow rhythm:**

- Run `pnpm -r typecheck` and (if frontend) `pnpm -r --filter @resonance/client build` before claiming work is done.
- Commit at meaningful checkpoints with the Co-Authored-By trailer (`Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`). Existing commits are bare one-liners — match that style.
- Don't push to remote unless asked OR when the user is mid-deploy debugging and needs the change live.
- For deploy-time issues: the user has access to Render + Vercel logs and can paste them directly. Ask for them rather than guessing.

**Design review pattern:**
The user runs the deployed site through Claude.ai (with screenshots) for visual review and pastes the suggestions back. Important caveats:

- Screenshots may be from before the latest deploy completed. Always check what's _actually_ shipped against the suggestion before redoing it. The user has acknowledged this caveat openly.
- The reviewer doesn't know what was already done in code, so duplicate suggestions are normal. Triage.
- The user's own additions / pushbacks at the end of a Claude.ai list are signal — pay attention to those specifically.

**Things the user has flagged as principles:**

- "I want this to be something I'd be enthusiastic to use multiple times" — the product needs to _feel_ lived-in, not just functional.
- "It needs to not just be a chatbot" — the differentiation pillars (persistent profile, library cross-references, verified metadata, persistent batches) are non-negotiable architectural commitments.
- The user is building this to defend in interviews. Code clarity and decision-articulation matter as much as features.

## Critical conventions specific to this repo

These complement what's in ARCHITECTURE.md, not duplicate it.

- **All AI prompts live in `apps/server/src/services/ai/prompts/`** as exported template functions. Never inline a prompt in a service file.
- **All AI structured outputs go through `apps/server/src/services/ai/schemas.ts`** (zod v4 — `import { z } from "zod/v4"`). Never construct an `output_config.format` ad-hoc.
- **Every recommendation must correspond to a real `media_cache` row.** No exceptions. Hallucinated titles silently drop in `collectRealCandidates`. This is the anti-hallucination guarantee.
- **Status-coded errors:** for user-state errors that aren't server faults (missing profile, rate limit hit, private Steam profile), throw `Error & { status: number }`. The global errorHandler reads `.status` and returns the right HTTP code.
- **Format enable/disable is server-enforced:** `collectRealCandidates` hard-filters by `profile.mediaAffinities` regardless of what the model proposes. Don't trust the prompt rule alone.
- **Rate limits are checked BEFORE the expensive call**, not after. See `services/rateLimit.ts` and the call sites in `api/onboarding.ts`, `api/recommendations.ts`, etc.
- **Profile saves invalidate `discovery_themes` inline.** When you add another derived cache, follow the same pattern.

## Where things live (current, not the original spec)

```
apps/
  client/
    src/
      components/
        marketing/      # signed-out landing page
        onboarding/     # Chat (long mode) + FastForm (form mode)
        profile/        # ProfileView, ProfileEditor, LibrarySection
        recommendations/# MediaCard + skeleton
        shared/         # PageHeader, EmptyState, LoadingPulse, Footer, Logo, Layout, Nav
      hooks/            # useProfile, useRecommendations, useBatches, useLibrary, useThemes, useEvaluate, useOnboarding, useFastOnboarding, useApi
      lib/              # api.ts, sse.ts (client-side fetch + SSE parser)
      pages/            # one .tsx per route + NotFoundPage
      styles/           # globals.css (Tailwind + a few keyframes)
  server/
    src/
      api/              # one .ts per resource (onboarding, recommendations, feedback, profile, library, evaluate, discover, media, me)
      db/               # schema.ts + migrations/
      lib/              # rateLimiter.ts (token bucket for adapters), sse.ts (SSE writer)
      middleware/       # auth.ts, error.ts
      services/
        ai/             # one file per AI mode + prompts/ + schemas.ts + aiHelpers.ts + client.ts + streaming.ts
        media/          # one adapter per source + aggregator.ts
        # plus: jobs.ts, rateLimit.ts, library.ts, steam.ts, profile.ts, feedback.ts,
        #       mediaCache.ts, onboardingSessions.ts, users.ts
packages/
  shared/               # MediaItem, TasteProfile, DiscoveryTheme, RecommendationStatus, etc.
ARCHITECTURE.md         # full design reference
README.md               # public-facing front page
render.yaml             # Render service blueprint
vercel.json             # repo-root build config
apps/client/vercel.json # Vercel routing config (rewrites + outputDirectory)
```

## File-size watch list

These are getting long but not yet painful. Don't split prematurely. Revisit if any cross 1200 lines or grow independent reusers.

| File                                    | Lines |
| --------------------------------------- | ----- |
| `services/ai/recommender.ts`            | ~900  |
| `pages/HomePage.tsx`                    | ~620  |
| `components/profile/ProfileEditor.tsx`  | ~610  |
| `pages/RecommendationsPage.tsx`         | ~610  |
| `components/profile/LibrarySection.tsx` | ~550  |

## Stuff that's documented and easy to forget

- **zod v4 cast:** `as unknown as Parameters<typeof zodOutputFormat>[0]` is required because the SDK's `.d.ts` imports zod v3 but its runtime imports zod v4. Documented in `schemas.ts`. Goes away when SDK fixes types.
- **Vercel reads `apps/client/vercel.json`** (the Root Directory's vercel.json), not the repo root one. Both files exist; the repo-root one is mostly inert. SPA rewrites + outputDirectory must be in the apps/client one.
- **Render free-tier cold start** is ~30s after 15 min idle. The frontend's fetch has no timeout so it just hangs and resolves; that's expected.
- **Clerk `pk_test_` instance** doesn't enforce origin allowlist; production `pk_live_` would.
- **iOS Safari auto-zoom** on focus is prevented by the global CSS rule that bumps `input/textarea/select` to 16px on viewports below 640px. Don't override this on individual inputs.

## Build order is no longer relevant

The original CLAUDE.md had a "Build order (suggested)" section — it's all done. Reference [ARCHITECTURE.md](./ARCHITECTURE.md) for the current architecture; reference [README.md](./README.md) for the public feature list.
