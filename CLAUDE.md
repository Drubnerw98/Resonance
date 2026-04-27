# CLAUDE.md — Cross-Media Recommendation Engine

## Project overview

A full-stack web app that provides AI-powered media recommendations across movies, TV, anime, manga, games, and books. The differentiator is a persistent "taste DNA" profile built through an AI-driven onboarding conversation, not just ratings or genre tags. Recommendations come with real media data (images, ratings, descriptions) from external APIs, not just AI text.

Portfolio project targeting dev jobs at startups/agencies.

## Stack

- **Frontend:** React 19 + TypeScript, Vite, deployed on Vercel
- **Backend:** Node.js with Express, Vercel serverless functions
- **Database:** PostgreSQL on Neon, Drizzle ORM
- **Auth:** Clerk (Google + GitHub OAuth)
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **External APIs:** TMDB (movies/TV), IGDB (games), Jikan/MAL (anime/manga), Open Library (books)
- **Styling:** Tailwind CSS

## Project structure

```
src/
├── client/                 # React frontend
│   ├── components/
│   │   ├── onboarding/     # Chat-based onboarding UI
│   │   ├── recommendations/# Rec feed, media cards, feedback
│   │   ├── profile/        # Taste profile viewer
│   │   └── shared/         # Layout, nav, common components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Client utilities, API client
│   └── pages/              # Route-level page components
├── server/
│   ├── api/                # Express route handlers
│   │   ├── onboarding.ts   # Onboarding chat endpoints
│   │   ├── recommendations.ts
│   │   ├── feedback.ts
│   │   └── profile.ts
│   ├── services/
│   │   ├── ai/             # Anthropic integration layer
│   │   │   ├── onboarding.ts    # Mode 1: conversational onboarding
│   │   │   ├── extraction.ts    # Mode 2: profile extraction
│   │   │   ├── recommender.ts   # Mode 3: recommendation pipeline
│   │   │   └── prompts/         # System prompt templates
│   │   ├── media/          # External API integrations
│   │   │   ├── aggregator.ts    # Unified media search interface
│   │   │   ├── tmdb.ts
│   │   │   ├── igdb.ts
│   │   │   ├── jikan.ts
│   │   │   └── openlibrary.ts
│   │   └── profile.ts     # Profile management + versioning
│   ├── db/
│   │   ├── schema.ts       # Drizzle schema definitions
│   │   ├── migrations/
│   │   └── index.ts        # DB connection
│   └── middleware/
│       └── auth.ts         # Clerk JWT verification
└── shared/
    └── types/              # Shared TypeScript types
        ├── media.ts        # MediaItem, MediaType, MediaSource
        ├── profile.ts      # TasteProfile interface
        └── recommendation.ts
```

## Database schema

Six tables. Use Drizzle ORM for all database access.

**users** — synced from Clerk on first login
- `id` uuid PK
- `clerk_id` string unique — Clerk's user ID
- `email` string
- `display_name` string
- `onboarding_status` enum: `pending | in_progress | complete`
- `created_at`, `updated_at` timestamps

**taste_profiles** — one active profile per user, stores structured JSON
- `id` uuid PK
- `user_id` uuid FK → users
- `current_version` int
- `profile_data` jsonb — conforms to TasteProfile interface (see below)
- `created_at`, `updated_at` timestamps

**profile_versions** — snapshot on every refinement for rollback and analytics
- `id` uuid PK
- `profile_id` uuid FK → taste_profiles
- `version_number` int
- `profile_data` jsonb
- `trigger` string — why it changed: `"onboarding"`, `"feedback_batch"`, `"manual_edit"`
- `created_at` timestamp

**onboarding_sessions** — stores the full conversation for profile extraction
- `id` uuid PK
- `user_id` uuid FK → users
- `status` enum: `active | completed | abandoned`
- `messages` jsonb — array of `{role, content}` for Anthropic API
- `turn_count` int
- `created_at`, `completed_at` timestamps

**recommendations** — every rec ever generated, with feedback state
- `id` uuid PK
- `user_id` uuid FK → users
- `batch_id` uuid — groups recs generated together
- `media_cache_id` uuid FK → media_cache
- `match_score` float — 0-1 thematic alignment
- `explanation` text — personalized reasoning from AI
- `taste_tags` text[] — which profile themes this matches
- `status` enum: `pending | seen | saved | skipped | rated`
- `rating` int nullable — 1-5 if user rated
- `created_at`, `acted_at` timestamps

**media_cache** — verified external API data, the anti-hallucination layer
- `id` uuid PK
- `external_id` string — ID from the source API
- `source` enum: `tmdb | igdb | jikan | openlibrary`
- `media_type` enum: `movie | tv | anime | manga | game | book`
- `title` string
- `normalized_data` jsonb — conforms to MediaItem interface
- `fetched_at` timestamp
- `expires_at` timestamp — refresh stale data

## Core types

### TasteProfile (stored as JSONB, enforced in TypeScript)

```typescript
interface TasteProfile {
  themes: {
    label: string;        // e.g. "earned transformation"
    weight: number;       // 0-1
    evidence: string;     // titles/moments that support this
  }[];
  archetypes: {
    label: string;        // e.g. "burden-carrying protagonist"
    attraction: string;   // why this resonates
  }[];
  narrativePrefs: {
    pacing: "slow-burn" | "propulsive" | "variable";
    complexity: "layered" | "focused" | "epic";
    tone: string[];       // ["bittersweet", "darkly comic"]
    endings: string;      // "ambiguous over neat"
  };
  mediaAffinities: {
    format: MediaType;
    comfort: number;      // 0-1, openness to this format
    favorites: string[];  // titles mentioned during onboarding
  }[];
  avoidances: string[];   // ["generic chosen-one plots", "fan service"]
}
```

### MediaItem (normalized from all external APIs)

```typescript
interface MediaItem {
  externalId: string;
  source: "tmdb" | "igdb" | "jikan" | "openlibrary";
  mediaType: "movie" | "tv" | "anime" | "manga" | "game" | "book";
  title: string;
  description: string;
  imageUrl: string | null;
  rating: number | null;       // normalized 0-10
  year: number | null;
  genres: string[];
  externalUrl: string;         // link to TMDB/MAL/etc page
  metadata: Record<string, unknown>; // source-specific extras
}
```

## AI integration layer — three modes

All AI calls use `claude-sonnet-4-6`. Keep system prompts in `/server/services/ai/prompts/` as template strings with interpolation points.

### Mode 1: Onboarding conversation

- **Type:** Multi-turn streaming chat
- **Endpoint:** `POST /api/onboarding/message` (streaming SSE response)
- **System prompt persona:** A curious, media-savvy friend. Asks *why* users love what they love, not just *what*. Digs into thematic preferences, character types, narrative structures across all media formats.
- **Conversation state:** Full message history stored in `onboarding_sessions.messages`, passed to each API call
- **Hidden analysis:** System prompt instructs Claude to include `<analysis>` tags in responses tracking emerging patterns. Strip these before sending to the frontend.
- **Completion signal:** Claude includes `<ready/>` when it has enough signal (~5-8 turns). Frontend detects this and triggers profile extraction.
- **Key instruction in prompt:** Never just ask "what's your favorite movie?" — ask about *moments*, *feelings*, *what kept them up at night thinking about it*.

### Mode 2: Profile extraction

- **Type:** Single non-streaming call
- **Trigger:** Onboarding complete OR feedback batch accumulated
- **Input:** Full onboarding transcript (or existing profile + recent feedback)
- **Output:** TasteProfile JSON conforming to the interface above
- **System prompt:** Analytical. Instructs Claude to identify patterns across all mentioned media, extract thematic DNA, and output strict JSON. No conversational text.
- **For refinement:** Send existing profile + array of recent feedback items (title, rating, skip reason). Prompt instructs Claude to evolve the profile, not rebuild it.

### Mode 3: Recommendation generation (hybrid pipeline)

Four steps, backend-orchestrated:

**Step 1 — AI generates candidates:**
Send the taste profile to Claude. It outputs JSON with two arrays:
- `titleSuggestions`: ~15-20 specific titles with media type and reason (treated as search hints, not trusted)
- `discoveryQueries`: genre + keyword combos for broader API search per format

**Step 2 — Backend validates against real APIs:**
- Title suggestions: fuzzy search each against the appropriate API (TMDB for movies/TV, IGDB for games, etc). Found → pull real data into media_cache. Not found → silently drop.
- Discovery queries: search each API, pull top results into media_cache.
- Merge, deduplicate, filter out anything the user has already seen (check recommendations table).

**Step 3 — AI reads synopses for deep thematic match:**
Send the taste profile + real candidate data (title, synopsis, genres, rating) to Claude. It scores each candidate 0-1 for thematic alignment and explains why. This is the quality filter — surface-level matches get low scores. Returns top 5-8 per format.

**Step 4 — Structured output:**
Claude outputs an array of recommendation objects: `{ mediaCacheId, matchScore, explanation, tasteTags }`. Backend saves to recommendations table, frontend renders as cards.

**Critical rule:** Every recommendation shown to the user MUST have a corresponding media_cache entry with real API data. If it's not in the cache, it doesn't exist.

## Media API aggregator

Each external API adapter (`tmdb.ts`, `igdb.ts`, `jikan.ts`, `openlibrary.ts`) implements:

```typescript
interface MediaApiAdapter {
  searchByTitle(title: string): Promise<MediaItem[]>;
  searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]>;
  getById(externalId: string): Promise<MediaItem | null>;
}
```

The aggregator (`aggregator.ts`) routes requests to the right adapter based on media type and normalizes all responses into the `MediaItem` shape.

Rate limiting: respect each API's limits. TMDB: 40 req/10s. IGDB: 4 req/s. Jikan: 3 req/s. Open Library: be polite. Implement per-adapter rate limiting with a simple token bucket.

## Auth flow

Clerk handles all auth. The backend verifies JWTs via Clerk middleware on every API route.

1. User signs in via Clerk's React components (Google or GitHub OAuth)
2. On first sign-in, a webhook or on-demand check creates the `users` row synced from Clerk
3. Every API request includes the Clerk session token in the Authorization header
4. `auth.ts` middleware verifies and attaches `userId` to the request

## API routes

All routes require auth except health check.

- `POST /api/onboarding/message` — send a message, get streaming AI response
- `GET /api/onboarding/session` — get current session state
- `POST /api/onboarding/complete` — trigger profile extraction
- `GET /api/profile` — get current taste profile
- `PUT /api/profile` — manually edit profile
- `POST /api/recommendations/generate` — trigger new recommendation batch
- `GET /api/recommendations` — get recommendations (filterable by format, status)
- `PATCH /api/recommendations/:id/feedback` — update status/rating
- `GET /api/media/:cacheId` — get cached media details

## Key conventions

- Use Drizzle's query builder, not raw SQL
- All AI prompts live in `/server/services/ai/prompts/` as exported template functions
- Error handling: wrap all external API calls in try/catch, never let a single API failure crash a recommendation batch
- Environment variables: `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`
- Use zod for runtime validation of AI JSON outputs — Claude can return malformed JSON, always validate
- Streaming: use Anthropic SDK's streaming mode for onboarding, forward SSE events to the frontend

## Build order (suggested)

1. Project scaffolding: Vite + React + Express + Drizzle + Clerk
2. Database schema + migrations
3. Auth flow (Clerk integration, middleware, user sync)
4. Onboarding chat UI + streaming endpoint (Mode 1)
5. Profile extraction (Mode 2) + profile viewer
6. Media API adapters (start with TMDB, add others incrementally)
7. Recommendation pipeline (Mode 3) + rec feed UI + media cards
8. Feedback loop (status updates, profile refinement)
9. Polish: loading states, error handling, responsive design
