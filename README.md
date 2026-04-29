# Resonance

> Cross-format media recommendations grounded in your taste DNA — movies, TV, anime, manga, games, and books — with explanations that cross-reference works you've already loved.

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
- **Library imports** — Letterboxd CSV (movies) and Goodreads CSV (books). 4-5 star ratings become positive cross-references; 1-2 star ratings flow into the avoid set; "read"-only filtering on Goodreads. MAL XML and Steam Web API designed but deferred.
- **Continuous evolution** — profile evolves via three paths: continued onboarding, automatic refinement after enough feedback accumulates, and manual edit through the profile editor.
- **Anti-hallucination layer** — every recommendation surfaced to the user corresponds to a real `media_cache` row. Hallucinated titles silently drop.

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

## Status

**Shipped:**

- All four AI modes (onboarding, extraction + refinement, 4-step recommendation pipeline, discovery themes) + evaluate verdicts
- Persistent batches with rename / delete / per-batch URLs
- Library imports: Letterboxd, Goodreads
- Manual profile editor (every field including weights and chip lists)
- Cross-batch dedup, format-aware prompting, anti-bias prompt section
- Streaming filter with 14-case smoke test for tag-boundary safety
- Async job system with mount-time resume on page reload

**Deferred:**

- Library imports: MyAnimeList (XML), Steam (Web API + SteamID input)
- Profile version rollback UI (history is stored; no viewer)
- Test coverage beyond the streaming smoke test
- Production deployment (Vercel-ready, not yet live)

See **[ARCHITECTURE.md → Known limitations](./ARCHITECTURE.md#10-known-limitations--whats-not-built)** for the full list with rationale.

## License

This is a portfolio project; not currently licensed for redistribution.
