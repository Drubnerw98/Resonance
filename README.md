# Resonance

Cross-media AI recommendation engine. See [`CLAUDE.md`](./CLAUDE.md) for the full spec.

## Layout

```
apps/
  client/      # Vite + React 19 + TypeScript frontend
  server/      # Express + Drizzle backend
packages/
  shared/      # Shared TypeScript types (MediaItem, TasteProfile, ...)
```

## Setup

```sh
pnpm install
cp .env.local.example .env.local
```

Then fill in the keys per [External services](#external-services) below.
Required to boot: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
`VITE_CLERK_PUBLISHABLE_KEY`. The rest can be added as we hit each build step.

## External services

Five accounts to create. Three of the media providers don't need keys at all.

### 1. Neon — Postgres database

Used by: Drizzle ORM (step 2 onward).

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. **Dashboard → Connection string → "Pooled connection"**.
3. Paste into `DATABASE_URL`.

The pooled connection is required for the Neon HTTP driver we use; the direct
connection string works too but won't scale well on serverless.

### 2. Clerk — auth

Used by: `@clerk/express` (server), `@clerk/clerk-react` (client) — step 3.

1. Create an app at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **User & authentication → Social Connections**: enable **Google** and
   **GitHub**. Clerk ships shared dev credentials so you can skip setting up
   your own Google/GitHub OAuth apps for local work — swap to your own before
   shipping.
3. **API keys**: copy the values into the env vars below.
   - `pk_test_…` → both `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`
   - `sk_test_…` → `CLERK_SECRET_KEY`

The publishable key is duplicated on purpose: the server reads
`CLERK_PUBLISHABLE_KEY` directly, the browser reads `VITE_CLERK_PUBLISHABLE_KEY`
(Vite only exposes `VITE_`-prefixed vars to client code).

The provider list, branding, and post-sign-in redirects all live in the
dashboard — `<SignIn />` and `<SignUp />` just render whatever it's configured
with.

### 3. Anthropic — Claude API

Used by: all three AI modes (onboarding, extraction, recommendation) — step 4
onward.

1. Sign in at [console.anthropic.com](https://console.anthropic.com).
2. **API Keys → Create Key**.
3. Paste into `ANTHROPIC_API_KEY`.

Note this incurs usage cost as soon as we start calling it.

### 4. TMDB — movies + TV

Used by: `services/media/tmdb.ts` — step 6.

1. Create an account at [themoviedb.org](https://www.themoviedb.org).
2. **Profile → Settings → API → Create** (request a developer key; takes a
   minute, no real review for hobby/dev use).
3. Copy the **API Read Access Token** (the long JWT, _not_ the short v3 API
   key — both are shown on the same page; we want the v4 token).
4. Paste into `TMDB_API_KEY`.

Free, generous rate limit (40 req / 10 s — we'll respect this in the adapter).

### 5. IGDB — games (via Twitch)

Used by: `services/media/igdb.ts` — step 6.

IGDB doesn't have its own auth; it piggybacks on Twitch developer credentials.

1. Sign in at [dev.twitch.tv/console](https://dev.twitch.tv/console) (any
   Twitch account works).
2. **Applications → Register Your Application**.
   - Name: anything.
   - OAuth redirect URLs: `http://localhost` (we won't use it — IGDB uses the
     server-to-server client-credentials flow, not the redirect flow).
   - Category: `Application Integration`.
3. Copy the **Client ID** → `IGDB_CLIENT_ID`.
4. Click **New Secret**, copy → `IGDB_CLIENT_SECRET`.

The server will exchange these for a short-lived access token at runtime, then
call IGDB with it. Rate limit: 4 req/s.

### 6. Jikan — anime + manga (no key)

Used by: `services/media/jikan.ts` — step 6.

Unofficial MyAnimeList API at [jikan.moe](https://jikan.moe). No signup, no
key. Rate limit: 3 req/s, hard limit 60/min — we'll throttle in the adapter.

### 7. Open Library — books (no key)

Used by: `services/media/openlibrary.ts` — step 6.

[openlibrary.org/dev/docs/api](https://openlibrary.org/dev/docs/api). No
signup. They ask for a polite User-Agent header and reasonable request rates —
we'll set both in the adapter.

## Dev

```sh
pnpm dev               # client + server in parallel
pnpm dev:client        # Vite on :5173
pnpm dev:server        # Express on :3001
```

The client proxies `/api/*` to the server in dev (see `apps/client/vite.config.ts`).

## Database

Schema lives in `apps/server/src/db/schema.ts`; migrations are committed under
`apps/server/src/db/migrations/`. Targets a Neon Postgres database via the
HTTP driver.

```sh
pnpm db:generate       # diff schema → new SQL migration in src/db/migrations
pnpm db:migrate        # apply pending migrations against DATABASE_URL
pnpm db:push           # (dev only) push schema directly without a migration
pnpm db:studio         # open Drizzle Studio
```

`db:generate` works without a live database. `db:migrate`, `db:push`, and
`db:studio` need `DATABASE_URL` set in `.env.local`.
