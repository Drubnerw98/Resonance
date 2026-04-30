# Resonance

> Cross-format media recommendations grounded in your taste DNA — movies, TV, anime, manga, games, and books — with explanations that cross-reference works you've already loved.

**Live demo: [resonance-client.vercel.app](https://resonance-client.vercel.app)**

A full-stack AI application built around three differentiation pillars that a one-shot Claude session can't match: a **persistent, structured taste profile** that evolves over time, a **library of imported / saved works** the recommender names by title in its explanations, and **persistent batches as reviewable artifacts** that let users return to any prompt-driven generation later.

For the architectural deep-dive — the *why* behind every major decision — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

<!--
  Screenshots go here once captured. Suggested order:
    docs/screenshots/home.png        – signed-in dashboard with poster row
    docs/screenshots/onboarding.png  – chat mid-conversation
    docs/screenshots/recommendations.png – batch with cards + match scores
    docs/screenshots/evaluate.png    – verdict card with status flags
    docs/screenshots/explore.png     – browse-mode themed cards
-->

## Features

- **AI-driven onboarding** — multi-turn streaming chat that probes for *moments* and *feelings*, not "favorite movie" lists. Server-side reasoning-tag stripping; deterministic readiness floor on top of the model's `<ready/>` self-judgment; adaptive scaffolding for users who don't naturally introspect.
- **Structured taste profile** — JSONB document with versioned history. Themes, archetypes, narrative preferences, format affinities, abstract avoidances, and specific dislikedTitles. Manually editable through the UI.
- **Cross-format recommendations** — 4-step pipeline: AI proposes candidates → real-API validation against TMDB / IGDB / Jikan / Open Library (every recommendation backed by verified metadata) → AI scores against profile + library → persisted as a named, reviewable batch.
- **"Would I like X?" verdicts** — type a specific title, get an honest read against your profile. Allowed to give negative answers. Surfaces status flags (already in library / on dislikedTitles / previously recommended).
- **Browse-mode themed surfaces** — six AI-generated curated entry surfaces tailored to the user's profile, regenerated when the profile changes. Click a theme → standard generation pipeline runs with the theme's prompt.
- **Refine flow ("stacked batches")** — every recommendation batch has a Refine button. Submitting an extra constraint kicks off a new batch generated from `original prompt, but also: <addition>`. Original batch sits untouched alongside the refined version.
- **Library imports across all four formats** — Letterboxd CSV (movies), Goodreads CSV (books, both `read` and `to-read` shelves), MyAnimeList XML (anime + manga, plan-to-watch/read mapped to watchlist), Steam Web API (owned games via SteamID, profile URL, or vanity URL).
- **Watchlist + plan-to** — mark a rec as "Plan to" or import your plan-to lists from any source. Watchlist items are deduped from future recommendations but don't anchor cross-references (the user hasn't actually engaged with them yet). Mark-as-consumed flips them into the regular library when you finish them.
- **Sort + filter** — recommendations sortable by match %, alphabetical, or year (asc/desc), per format tab; URL-synced.
- **Format enable/disable** — disable a medium in your profile and it's hard-filtered out everywhere: rec batches, browse themes, evaluate dropdown, all of it. Server-enforced, not just prompt-suggested.
- **Continuous evolution** — profile evolves via three paths: continued onboarding, automatic refinement (auto-fires after ≥5 unrefined feedback items), and manual edit through the profile editor. UI shows a banner when an auto-refinement starts in the background.
- **Per-user rate limits** — daily caps on AI-bound endpoints (onboarding messages, generations, evaluates, theme refreshes, manual refinements) prevent budget burn-through. Returns clean 429s, resets at midnight UTC.
- **Anti-hallucination layer** — every recommendation surfaced to the user corresponds to a real `media_cache` row. Hallucinated titles silently drop.
- **Mobile-aware UI** — hamburger nav below 640px viewport, iOS Safari focus auto-zoom prevented, branded 404 page, smooth route transitions.

## Stack

| Layer        | Choice                                                       |
| ------------ | ------------------------------------------------------------ |
| Frontend     | React 19 + TypeScript, Vite 6, Tailwind v4, react-router-dom v7 |
| Backend      | Node + Express 4 (Vercel-ready)                              |
| Database     | PostgreSQL on Neon, Drizzle ORM                              |
| Auth         | Clerk (Google + GitHub OAuth)                                |
| AI           | Anthropic Claude (`claude-sonnet-4-6`), structured outputs via zod v4 |
| External APIs | TMDB, IGDB+Twitch, Jikan, Open Library                      |
| Build        | pnpm monorepo (`apps/client`, `apps/server`, `packages/shared`) |

## Layout

```
apps/
  client/           # Vite + React 19 frontend
  server/           # Express + Drizzle backend
packages/
  shared/           # Shared TypeScript types (MediaItem, TasteProfile, ...)
ARCHITECTURE.md     # Full architectural reference
CLAUDE.md           # Working spec used during development
```

## Setup

```sh
pnpm install
cp .env.local.example .env.local
```

Then fill in the keys per [External services](#external-services). The minimum to boot is `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`. Add `ANTHROPIC_API_KEY` to use any AI feature; add the media keys to enable that format's recommendations.

### External services

Five accounts. Three media providers don't need keys.

#### Neon — Postgres

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. **Dashboard → Connection string → "Pooled connection"**.
3. Paste into `DATABASE_URL`.

The pooled connection is required for the Neon HTTP driver.

#### Clerk — auth

1. Create an app at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **User & authentication → Social Connections**: enable **Google** and **GitHub**.
3. **API keys**: copy values into env vars.
   - `pk_test_…` → both `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`
   - `sk_test_…` → `CLERK_SECRET_KEY`

The publishable key is duplicated because Vite only exposes `VITE_`-prefixed vars to the browser; the server reads the un-prefixed one.

#### Anthropic — Claude API

1. Sign in at [console.anthropic.com](https://console.anthropic.com).
2. **API Keys → Create Key**.
3. Paste into `ANTHROPIC_API_KEY`.

Incurs usage cost. Onboarding turns are prompt-cached after turn 3-4 (~10% of normal input cost).

#### TMDB — movies + TV

1. Create an account at [themoviedb.org](https://www.themoviedb.org).
2. **Profile → Settings → API → Create**.
3. Copy the **API Read Access Token** (the long JWT, *not* the v3 API key).
4. Paste into `TMDB_API_KEY`.

Free, 40 req / 10 s.

#### IGDB — games (via Twitch)

1. Sign in at [dev.twitch.tv/console](https://dev.twitch.tv/console).
2. **Applications → Register Your Application**.
   - OAuth redirect URLs: `http://localhost` (unused — IGDB uses client-credentials flow).
   - Category: `Application Integration`.
3. Copy **Client ID** → `IGDB_CLIENT_ID`.
4. Click **New Secret** → `IGDB_CLIENT_SECRET`.

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

Schema lives in `apps/server/src/db/schema.ts`; migrations are committed under `apps/server/src/db/migrations/`. Targets Neon Postgres via the HTTP driver.

```sh
pnpm db:generate       # diff schema → new SQL migration
pnpm db:migrate        # apply pending migrations against DATABASE_URL
pnpm db:studio         # open Drizzle Studio
```

`db:generate` works without a live database. `db:migrate` and `db:studio` need `DATABASE_URL`.

## Deployment

Resonance is set up for a **split deploy**: frontend on Vercel, backend on Render, database on Neon, auth on Clerk. The frontend is static; the backend stays a single long-lived Express process so the in-memory job tracker for recommendation generation works as designed (see [ARCHITECTURE.md → Job system](./ARCHITECTURE.md#7-job-system)).

### Frontend — Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Vercel auto-detects pnpm + the `vercel.json` at the repo root.
2. **Environment variables** (Settings → Environment Variables):
   - `VITE_API_BASE_URL` → `https://<your-render-service>.onrender.com/api`
   - `VITE_CLERK_PUBLISHABLE_KEY` → your Clerk publishable key
3. **Deploy.** Vercel's pnpm support handles the workspace; `vercel.json` pins the build command + output directory.

### Backend — Render

1. **New → Blueprint** at [render.com](https://render.com). Point it at this repo; it picks up `render.yaml`.
2. **Set secrets** in the Render dashboard (each shows as "Sync: false" pending):
   - `FRONTEND_ORIGIN` → your Vercel URL, e.g. `https://resonance.vercel.app` (comma-separate to allow preview deploys too)
   - `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` — same values as your local `.env.local`
   - `STEAM_API_KEY` (optional, only needed for the Steam library-import feature)
3. **Deploy.** Render runs `pnpm install` then `pnpm --filter @resonance/server start` (the server uses `tsx` directly to avoid the workspace-deps build dance).

### Free-tier gotchas

- **Render free tier spins down after 15 min idle.** First request after that takes ~30s (cold start). Acceptable for testing and personal use; upgrade to the paid tier for real users.
- **In-memory job tracker is single-instance only.** Don't scale Render replicas above 1 — running rec generation across multiple containers breaks the polling pattern. Documented in ARCHITECTURE.md as the open work for "production-grade" deployment.

## Status

**Shipped + deployed:**

- Live at [resonance-client.vercel.app](https://resonance-client.vercel.app) — Vercel frontend + Render backend + Neon Postgres + Clerk auth
- All four AI modes (onboarding, extraction + refinement, 4-step recommendation pipeline, discovery themes) + evaluate verdicts
- Persistent batches with rename / delete / per-batch URLs / refine flow
- Library imports across all four formats: Letterboxd, Goodreads, MyAnimeList, Steam
- Watchlist + plan-to status (per rec + per imported library item)
- Manual profile editor (every field including weights, chip lists, format enable/disable)
- Cross-batch dedup, format-aware prompting, anti-bias prompt section, format hard-filter on disabled mediums
- Sort + filter on recommendations (URL-synced)
- Per-user daily rate limits on AI-bound endpoints
- Streaming filter with 14-case smoke test for tag-boundary safety
- Async job system with mount-time resume on page reload
- Mobile nav (hamburger), iOS focus auto-zoom fix, branded 404, signed-out landing page

**Deferred (intentional):**

- Postgres-backed jobs + rate limiter (only matters at multi-instance scale)
- Custom domain + production Clerk instance (`pk_live_…`)
- Test coverage beyond the streaming smoke test
- Profile version rollback UI (history is stored)
- Recent-evaluations history (persistence layer for verdicts)
- Letterboxd watchlist.csv + Steam wishlist (Valve gated the JSON endpoint)

See **[ARCHITECTURE.md → Known limitations](./ARCHITECTURE.md#11-known-limitations--whats-not-built)** for the full list with rationale.

## License

This is a portfolio project; not currently licensed for redistribution.
