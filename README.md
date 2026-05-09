# Resonance

[![CI](https://github.com/Drubnerw98/Resonance/actions/workflows/ci.yml/badge.svg)](https://github.com/Drubnerw98/Resonance/actions/workflows/ci.yml)

> Cross-format media recommendations grounded in your taste DNA, across movies, TV, anime, manga, games, and books, with explanations that cross-reference works you've already loved.

**Live demo: [resonance-client.vercel.app](https://resonance-client.vercel.app)**

A full-stack AI application built around three differentiation pillars that a one-shot Claude session can't match: a **persistent, structured taste profile** that evolves over time, a **library of imported and saved works** that the recommender names by title in its explanations, and **persistent batches as reviewable artifacts** that let users return to any prompt-driven generation later.

For the architectural deep-dive (the *why* behind every major decision), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

<!--
  Demo GIF goes here once recorded. Suggested placement:
    1. Capture a 25-30 second screen recording of the core loop:
       onboarding chat → taste profile → generate batch → rec card with
       cross-reference → "would I like X?" verdict.
    2. Save to docs/demo.gif (keep under ~10 MB for fast README rendering;
       use ffmpeg or gifski with palette optimization if needed).
    3. Replace the comment block below with:
         ![Demo](docs/demo.gif)

       For a dual-resolution / dark-mode-aware version, use the
       <picture> form GitHub honors in markdown.
-->

> **Demo GIF coming soon.** See the comment above this line for capture and embed instructions.

## Features

The five things that make Resonance more than a chat wrapper:

- **AI-driven onboarding, two paths.** *Long mode:* multi-turn streaming chat that probes for *moments* and *feelings*, not "favorite movie" lists. Server-side reasoning-tag stripping, deterministic readiness floor on top of the model's `<ready/>` self-judgment, adaptive scaffolding for users who don't naturally introspect. *Fast mode:* one-shot guided form (titles + narrative-shape picks + avoidances). Same `TasteProfile` output, ~30 seconds instead of ~10 minutes. Both flow through the same extraction schema.
- **Structured taste profile.** JSONB document with versioned history. Themes, archetypes, narrative preferences, format affinities, abstract avoidances, and specific dislikedTitles. Manually editable through the UI, automatically refined as feedback accumulates.
- **Cross-format recommendations.** 4-step pipeline: the model proposes candidates, real-API validation against TMDB / IGDB / Jikan / Open Library backs every recommendation with verified metadata, the model scores survivors against profile and library, results persist as a named, reviewable batch.
- **Library imports across all four formats.** Letterboxd CSV, Goodreads CSV, MyAnimeList XML, Steam Web API. Imported works become anchors that the recommender cites by title in its explanations.
- **"Would I like X?" verdicts.** Type a specific title, get an honest read against your profile. The model is allowed to give negative answers. Surfaces status flags (already in library, on dislikedTitles, previously recommended).
- **Refine flow ("stacked batches").** Every recommendation batch has a Refine button. Submit an extra constraint and a new batch generates from "original prompt, but also: \<addition\>". The original sits untouched alongside the refined version.

<details>
<summary>More features (browse-mode, watchlist, sort, mobile, rate limits, format toggles)</summary>

- **Browse-mode themed surfaces.** Six AI-generated curated entry surfaces tailored to the user's profile, regenerated when the profile changes. Click a theme and the standard generation pipeline runs with the theme's prompt.
- **Watchlist + plan-to.** Mark a rec as "Plan to" or import your plan-to lists from any source. Watchlist items are deduped from future recommendations but don't anchor cross-references (the user hasn't actually engaged with them yet). Mark-as-consumed flips them into the regular library when you finish.
- **Sort + filter.** Recommendations sortable by match %, alphabetical, or year (asc/desc), per format tab, URL-synced.
- **Format enable/disable.** Disable a medium in your profile and it's hard-filtered out everywhere (rec batches, browse themes, evaluate dropdown). Server-enforced, not just prompt-suggested.
- **Continuous evolution.** Profile evolves via three paths: continued onboarding, automatic refinement (auto-fires after ≥5 unrefined feedback items), and manual edit through the profile editor. UI shows a banner when an auto-refinement starts in the background.
- **Per-user rate limits.** Daily caps on AI-bound endpoints (onboarding messages, generations, evaluates, theme refreshes, manual refinements) prevent budget burn-through. Returns clean 429s, resets at midnight UTC.
- **Anti-hallucination layer.** Every recommendation surfaced to the user corresponds to a real `media_cache` row. Hallucinated titles silently drop.
- **Mobile-aware UI.** Hamburger nav below 640px viewport, iOS Safari focus auto-zoom prevented, branded 404 page, smooth route transitions.

</details>

## Stack

| Layer         | Choice                                                                |
| ------------- | --------------------------------------------------------------------- |
| Frontend      | React 19 + TypeScript, Vite 6, Tailwind v4, react-router-dom v7       |
| Backend       | Node + Express 4 (Vercel-ready)                                       |
| Database      | PostgreSQL on Neon, Drizzle ORM                                       |
| Auth          | Clerk (Google + GitHub OAuth)                                         |
| AI            | Anthropic Claude (`claude-sonnet-4-6`), structured outputs via zod v4 |
| External APIs | TMDB, IGDB+Twitch, Jikan, Open Library                                |
| Build         | pnpm monorepo (`apps/client`, `apps/server`, `packages/shared`)       |

## Layout

```
apps/
  client/           # Vite + React 19 frontend
  server/           # Express + Drizzle backend
packages/
  shared/           # Shared TypeScript types (MediaItem, TasteProfile, ...)
docs/               # Audit notes, historical implementation plans
ARCHITECTURE.md     # Full architectural reference
CLAUDE.md           # Working spec used during development
```

## Setup

```sh
pnpm install
cp .env.local.example .env.local
```

Then fill in the keys per [External services](#external-services). The minimum to boot is `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`. Add `ANTHROPIC_API_KEY` to use any AI feature, then add the media keys to enable that format's recommendations.

### External services

Five accounts. Three media providers don't need keys.

#### Neon, Postgres

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. **Dashboard → Connection string → "Pooled connection"**.
3. Paste into `DATABASE_URL`.

The pooled connection is required for the Neon HTTP driver.

#### Clerk, auth

1. Create an app at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **User & authentication → Social Connections**: enable **Google** and **GitHub**.
3. **API keys**: copy values into env vars.
   - `pk_test_…` into both `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`
   - `sk_test_…` into `CLERK_SECRET_KEY`

The publishable key is duplicated because Vite only exposes `VITE_`-prefixed vars to the browser. The server reads the un-prefixed one.

#### Anthropic, Claude API

1. Sign in at [console.anthropic.com](https://console.anthropic.com).
2. **API Keys → Create Key**.
3. Paste into `ANTHROPIC_API_KEY`.

Incurs usage cost. Onboarding turns are prompt-cached after turn 3-4 (~10% of normal input cost).

#### TMDB, movies + TV

1. Create an account at [themoviedb.org](https://www.themoviedb.org).
2. **Profile → Settings → API → Create**.
3. Copy the **API Read Access Token** (the long JWT, *not* the v3 API key).
4. Paste into `TMDB_API_KEY`.

Free, 40 req / 10 s.

#### IGDB, games (via Twitch)

1. Sign in at [dev.twitch.tv/console](https://dev.twitch.tv/console).
2. **Applications → Register Your Application**.
   - OAuth redirect URLs: `http://localhost` (unused, IGDB uses client-credentials flow).
   - Category: `Application Integration`.
3. Copy **Client ID** into `IGDB_CLIENT_ID`.
4. Click **New Secret** and paste into `IGDB_CLIENT_SECRET`.

The server exchanges these for an OAuth token at runtime. Rate limit: 4 req/s.

#### Jikan + Open Library

No signup, no keys. Rate-limited in-adapter.

## Dev

```sh
pnpm dev               # client + server in parallel
pnpm dev:client        # Vite on :5173
pnpm dev:server        # Express on :3001
```

The client proxies `/api/*` to the server in dev (see `apps/client/vite.config.ts`).

## Database

Schema lives in `apps/server/src/db/schema.ts`. Migrations are committed under `apps/server/src/db/migrations/`. Targets Neon Postgres via the HTTP driver.

```sh
pnpm db:generate       # diff schema → new SQL migration
pnpm db:migrate        # apply pending migrations against DATABASE_URL
pnpm db:studio         # open Drizzle Studio
```

`db:generate` works without a live database. `db:migrate` and `db:studio` need `DATABASE_URL`.

## Deployment

Resonance is set up for a **split deploy**: frontend on Vercel, backend on Render, database on Neon, auth on Clerk. The frontend is static. The backend runs as a single long-lived Express process so the in-memory rate-limit counters work as designed (jobs themselves are Postgres-backed). See [ARCHITECTURE.md → Job system](./ARCHITECTURE.md#7-job-system).

### Frontend, Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Vercel auto-detects pnpm + the `vercel.json` at the repo root.
2. **Environment variables** (Settings → Environment Variables):
   - `VITE_API_BASE_URL` = `https://<your-render-service>.onrender.com/api`
   - `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
3. **Deploy.** Vercel's pnpm support handles the workspace. `vercel.json` pins the build command and output directory.

### Backend, Render

1. **New → Blueprint** at [render.com](https://render.com). Point it at this repo and it picks up `render.yaml`.
2. **Set secrets** in the Render dashboard (each shows as "Sync: false" pending):
   - `FRONTEND_ORIGIN` = your Vercel URL, e.g. `https://resonance.vercel.app` (comma-separate to allow preview deploys too)
   - `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, same values as your local `.env.local`
   - `STEAM_API_KEY` (optional, only needed for the Steam library-import feature)
3. **Deploy.** Render runs `pnpm install` then `pnpm --filter @resonance/server start`. The server uses `tsx` directly to avoid the workspace-deps build dance.

### Free-tier gotchas

- **Render free tier spins down after 15 min idle.** First request after that takes ~30s (cold start). Acceptable for testing and personal use; upgrade to the paid tier for real users.
- **In-memory rate limiter is single-instance only.** Don't scale Render replicas above 1. The job tracker is Postgres-backed (safe for multi-instance), but rate-limit counters live in process memory and would split across replicas.

## Status

**Shipped + deployed:**

- Live at [resonance-client.vercel.app](https://resonance-client.vercel.app), Vercel frontend + Render backend + Neon Postgres + Clerk auth.
- All four AI modes (onboarding, extraction + refinement, 4-step recommendation pipeline, discovery themes) plus evaluate verdicts.
- Persistent batches with rename / delete / per-batch URLs / refine flow.
- Library imports across all four formats: Letterboxd, Goodreads, MyAnimeList, Steam.
- Watchlist + plan-to status (per rec + per imported library item).
- Manual profile editor (every field including weights, chip lists, format enable/disable).
- Cross-batch dedup, format-aware prompting, anti-bias prompt section, format hard-filter on disabled mediums.
- Sort + filter on recommendations (URL-synced).
- Per-user daily rate limits on AI-bound endpoints.
- Postgres-backed job tracker with mount-time resume on page reload, plus boot-time orphan recovery.
- Streaming filter with 28-case test covering chunk-boundary splits and malformed tags.
- Vitest suite (~70 cases) covering streaming, AI schema validators, rate-limit math, and the recommendation-pipeline filter logic. CI runs lint + typecheck + tests + build on push and PR.
- Mobile nav (hamburger), iOS focus auto-zoom fix, branded 404, signed-out landing page.

**Deferred (intentional):**

- Postgres-backed rate limiter (only matters at multi-instance scale).
- Custom domain + production Clerk instance (`pk_live_…`).
- Profile version rollback UI (history is stored).
- Recent-evaluations history (persistence layer for verdicts).
- Letterboxd watchlist.csv + Steam wishlist (Valve gated the JSON endpoint).

See **[ARCHITECTURE.md → Known limitations](./ARCHITECTURE.md#11-known-limitations--whats-not-built)** for the full list with rationale, and **[docs/AUDIT.md](./docs/AUDIT.md)** for a senior-engineer surface-level audit.

## How this was built

I used Claude Code as a paired collaborator throughout this project, the way I'd work with a senior engineer who can write code at machine speed but needs me to make the architectural calls. The model produced most of the lines. I produced the system.

Three decisions where I overruled or extended what the model would have done by default, illustrative of the broader pattern:

1. **The `media_cache` anti-hallucination check.** Claude's first instinct on the recommendation pipeline was to ask the model for titles and trust the response. I added the rule that *every* user-facing recommendation must correspond to a real row in `media_cache`, populated by an actual API hit against TMDB / IGDB / Jikan / Open Library. Hallucinated titles silently drop in `collectRealCandidates`. This is the single most important guarantee in the system, and the differentiation pillar that makes Resonance distinct from a one-shot chat session. The model would have shipped a faster, looser version that occasionally recommended books that don't exist.

2. **The streaming reasoning-tag stripper.** Sonnet 4.6 has a strong training-time bias toward emitting `<thinking>` blocks even when the prompt explicitly asks for `<analysis>`. Claude's first version of the streaming filter handled one tag name. I extended it to handle both, plus the `<ready/>` self-judgment signal, plus chunk-boundary safety so a tag splitting across SSE chunks (`<ana` then `lysis>`) doesn't leak the model's scratch pad to the user. The 28-case test pins the boundary cases. This is the kind of correctness work that's invisible when it works and humiliating when it doesn't.

3. **The in-memory job tracker as a deliberate scope cut.** Claude's instinct was to reach for Redis or a Postgres-backed queue from day one. I overruled, started with a single-process in-memory `Map`, and shipped the recommendation flow weeks faster as a result. Months later, when I was actually deploying to Render and needed cross-restart durability, I graduated to Postgres-backed jobs (with boot-time orphan recovery). The graduation is in the commit history. The point isn't "in-memory was right forever," it's "premature scale was wrong, and recognizing that took judgment the model didn't have."

The architecture decisions in [ARCHITECTURE.md](./ARCHITECTURE.md) are mine. The shape of every subsystem (the four-mode AI partition, the persistent-batch model, the format hard-filter pattern, the schema-as-contract-and-validator pattern, the cross-batch series-variant dedup) reflects calls I made about what mattered for this product, often against the grain of "just do what's typical." Claude wrote the code that implemented those calls and pushed back when my plans had holes. That collaboration shape, model as fast collaborator, human as system designer, is the thing the project is most a portfolio piece of.

## License

This is a portfolio project. Not currently licensed for redistribution.
