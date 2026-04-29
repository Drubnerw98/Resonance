# Architecture

This is the architecture reference for Resonance — the *why* behind decisions,
not just the *what*. Walks every subsystem, its role in the larger pipeline,
and the trade-offs that drove the choice. Read top-to-bottom on the first pass;
later sections assume the earlier vocabulary.

---

## 1. What this is

A cross-format media recommendation system grounded in a persistent "taste DNA"
profile. Users go through an AI-driven onboarding conversation that produces a
structured `TasteProfile`. That profile then drives recommendations across six
formats — movies, TV, anime, manga, video games, and books — with explanations
that cross-reference works the user has already loved.

The product question is "is this just a chatbot?". The answer is three pillars
that genuinely accumulate value over time:

1. **Persistent profile** that evolves through onboarding, manual feedback, and
   continued chats — not regenerated from scratch on every session.
2. **Library cross-references** — recommendations name specific works the user
   has saved or imported, e.g. *"the same fractured-interior-concealed-by-
   performance architecture you found in No Longer Human and Goodnight
   Punpun"*. This is the differentiation moment.
3. **Persistent batches as artifacts** — every prompt-driven generation
   becomes a named, reviewable object the user can revisit, rename, and
   organize.

A one-shot Claude session can do none of these. The architecture is structured
around making these three pillars work reliably.

### Why not Claude with Projects?

The stronger version of the "is this just a chatbot?" challenge: Claude.ai
with Projects has persistent context, web search, and good taste. Couldn't a
user with a well-crafted Project achieve most of this themselves?

For one technically-comfortable user willing to do the system work
themselves, probably yes. Resonance isn't trying to beat Claude at being a
chatbot. The reason a product exists is that the AI is one component among
many — everything around it is the engineering, and that's where Claude.ai
falls short:

- **Verification.** Every recommendation in Resonance corresponds to a real
  `media_cache` row pulled from TMDB, IGDB, Jikan, or Open Library. The
  model *proposes*, the system *verifies*. Hallucinated titles silently
  drop. Claude has confidently recommended books that don't exist and
  fabricated years/directors. A real metadata layer is non-negotiable for
  trust.
- **Structured persistence vs. conversational memory.** `TasteProfile` is a
  zod-validated JSONB document with versioned history. Inspectable,
  editable, queryable. Project memory is a context window — compresses,
  drifts, recency-biased, opaque. You can't open Claude's memory and
  adjust the weight on a theme. You can in Resonance.
- **Cross-format library at scale.** 500 Letterboxd-rated movies, used as
  named cross-references in every future explanation. Pasting a list into
  Claude works, but the recall is non-deterministic and biased toward the
  start of the list. Resonance's library is structured: every anchor is
  equally available, deduped by canonical title, gated by rating threshold.
- **Workflow orchestration.** A rec batch is three distinct AI calls
  (candidate generation, scoring, sometimes refinement) coordinated with
  four external API adapters and structured persistence. Each step has its
  own prompt, schema, fallback rules. Claude.ai is one-prompt-one-response;
  pipelines need code.
- **Multi-tenancy + product surface.** This is the real point. Resonance is
  *an application* — multiple users, isolated profiles, isolated libraries,
  shareable URLs, auth. Claude.ai is a tool *you* use repeatedly. Different
  shape, different problem.

The senior take is: AI is a component, not the whole system. Models do what
models are great at — reading taste, finding creative connections, scoring
novel candidates. Traditional engineering — adapters, deduplication, schema
validation, rate limiting, persistence, workflow orchestration — does what
it's good at. The product is in how those layers compose. This codebase is
partly an exercise in finding *exactly* where that boundary sits.

---

## 2. Stack

| Layer            | Choice                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Frontend         | React 19 + TypeScript, Vite 6, Tailwind v4, react-router-dom v7       |
| Backend          | Node + Express 4, Vercel-ready serverless                             |
| Database         | PostgreSQL on Neon (HTTP driver), Drizzle ORM 0.38                    |
| Auth             | Clerk (`@clerk/express`, `@clerk/clerk-react`)                        |
| AI               | `@anthropic-ai/sdk`, `claude-sonnet-4-6`                              |
| External APIs    | TMDB (movies/TV), IGDB+Twitch (games), Jikan (anime/manga), Open Library (books) |
| Validation       | zod v4 (via `import { z } from "zod/v4"`)                             |
| Build / repo     | pnpm monorepo: `apps/client`, `apps/server`, `packages/shared`        |

A few decisions worth pulling out:

- **Drizzle over Prisma.** Type-safe SQL without the runtime weight of an ORM.
  Migrations are real SQL files in `apps/server/src/db/migrations/`,
  auditable and editable when generated migrations need a manual fix (which
  happened once for an FK-on-empty-table issue with `recommendation_batches`).
- **Neon HTTP driver.** No connection pool to manage, works in serverless. The
  trade-off is no multi-statement transactions; profile saves split version
  insert and main upsert into separate calls (lose-a-snapshot tolerance over
  lose-the-data atomicity).
- **`claude-sonnet-4-6`.** Tested Haiku 4.5 for scoring during development;
  cross-format thematic depth dropped noticeably. Sonnet 4.6 is the
  cost/quality sweet spot for this workload.
- **pnpm monorepo with shared types.** `packages/shared` contains
  `MediaItem`, `TasteProfile`, `DiscoveryTheme` etc. Both client and server
  import the same types, so a backend change to a shape causes a client
  typecheck failure rather than a runtime mismatch.

---

## 3. Data model

Nine tables. Each has a clear single responsibility.

| Table                    | Stores                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| `users`                  | Clerk-synced user rows (clerk_id, email, onboarding_status)                     |
| `taste_profiles`         | Current profile per user (one row per user, JSONB profile_data)                 |
| `profile_versions`       | Historical profile snapshots, `trigger` enum (onboarding/feedback_batch/manual_edit) |
| `onboarding_sessions`    | Full chat transcripts, JSONB `messages` array                                   |
| `media_cache`            | Normalized external-API data — the anti-hallucination layer                     |
| `recommendation_batches` | First-class batch objects (name, prompt, timestamps)                            |
| `recommendations`        | Every rec ever, joined to a batch + a media_cache row + status/rating           |
| `library_items`          | Imported (Letterboxd / Goodreads) or manually-added works                       |
| `discovery_themes`       | Cached browse-mode entry surfaces, regenerated on profile change                |

**Key constraints worth knowing:**

- `unique(user_id, media_cache_id)` on `recommendations` — same media never
  recommended twice to the same user. Insert via `onConflictDoNothing`.
- `unique(user_id, media_type, title)` on `library_items` — re-importing the
  same Letterboxd CSV is idempotent.
- `unique(source, external_id)` on `media_cache` — TMDB id 1234 stored once
  across all users; cache is shared.
- `media_type` is a Postgres enum (`movie | tv | anime | manga | game | book`)
  used in five tables — single source of truth.

**Why JSONB for `taste_profiles.profile_data`:** the profile is hierarchical,
always read/written atomically, and its schema evolves through code rather
than migrations (it gained `dislikedTitles` mid-project without a DB change).
Normalizing into themes/archetypes/affinities tables would mean every read is
a 4-way join and every write is a transactional update across 4 tables. JSONB
is the right call when the data is treated as one document.

The same logic applies to `media_cache.normalized_data` (varies slightly
per source) and `onboarding_sessions.messages` (just an append-only array).

---

## 4. The four AI modes

This is the heart of the system. Four model interaction patterns, each tuned
to a different shape of work.

### Mode 1: Onboarding chat

`POST /api/onboarding/message` is an SSE streaming endpoint.

**Flow per turn:**

1. User message appended to `session.messages`.
2. Full transcript (including assistant's prior hidden `<analysis>` blocks)
   sent to Claude.
3. Stream filtered server-side: `<analysis>`, `<thinking>`, and `<ready/>`
   tags stripped before forwarding to the client.
4. Full **raw** assistant text persisted (including stripped tags) — so
   subsequent turns have continuity.
5. `<ready/>` signal → SSE event → frontend shows "Finish onboarding" CTA.

**`StreamFilter` (services/ai/streaming.ts)** is the non-trivial bit. SSE
chunks can split mid-tag — `"<analy"` arrives in chunk N, `"sis>secret</analysis>"`
in chunk N+1. Naive `.includes()` would leak `"<analy"` to the user. The filter
buffers the longest possible partial-tag suffix of each chunk and only emits
the prefix that's known-safe. 14 hand-runnable test cases in
`streaming.test.ts` cover the boundary cases (lone `<`, leading whitespace
suppression after a stripped reasoning block, ready-tag splits, etc.).

**Hidden `<analysis>` block.** The system prompt requires the model to start
every turn with a scratchpad block tracking: titles named so far, themes/
archetypes/format affinities being updated, formats touched, mode
(free-form vs scaffolded), and whether the avoidance probe has been done.
The user never sees it, but it's preserved in the transcript so the model
has running continuity across turns.

**Deterministic readiness floor.** Models can fire `<ready/>` too early
against thin transcripts ("3 themes!" but they're shallow). Solution: server
computes `meetsReadinessFloor(messages)` requiring ≥5 user turns and ≥200
user words; if the floor isn't met, the `<ready/>` signal is silently
dropped and the conversation continues. Hybrid: model self-judgment +
deterministic gate.

**Adaptive scaffolding.** The prompt teaches the model to detect users who
don't naturally introspect ("I dunno", "I just liked it") and shift to
scaffolded question shapes — forced choice between shapes, comparison-via-
examples, pattern callouts, recognition via lists. Mode is sticky once
flipped, tracked in the analysis block. Readiness criteria don't relax in
scaffolded mode; the path to them changes.

**Prompt caching.** The last message in each turn is marked
`cache_control: ephemeral`. After ~3-4 turns the cumulative prefix passes
Sonnet's ~2K-token cache minimum and subsequent turns read system prompt +
prior history at ~10% input cost.

### Mode 2: Profile extraction + refinement

Single non-streaming call. Three flavors:

- **`extractProfile(history)`** — full transcript → `TasteProfile`. Used at
  the end of initial onboarding.
- **`evolveProfileFromTranscript(current, history)`** — continued onboarding.
  Preserves identity; updates rather than rebuilds. "Refine, don't reinvent."
- **`refineProfile(userId)`** — feedback-driven. Pulls recent feedback rows
  (skipped, rated 1-5) and evolves the profile against them. Auto-fires
  when ≥5 unrefined feedback items have accumulated since the last save.

All three use `TasteProfileSchema` (`services/ai/schemas.ts`) for both:

- **`output_config.format`** — schema sent to the model so generation is
  constrained at the API level.
- **Runtime validation** — `TasteProfileSchema.parse()` on the response, so
  we never store malformed JSON.

**zod v4 specifically.** The Anthropic SDK helper `zodOutputFormat` imports
from `zod/v4` internally; passing a v3 schema fails at runtime with a
cryptic "Cannot read properties of undefined (reading 'def')". Fix: use
`import { z } from "zod/v4"` everywhere AI schemas are defined. The SDK's
own `.d.ts` types still import from "zod" (v3), so calls require an
`as unknown as Parameters<typeof zodOutputFormat>[0]` cast.

**`saveProfile` invalidates discovery themes.** Every profile save (any
trigger) deletes the user's `discovery_themes` row inline. Next
`/api/discover/themes` GET regenerates against the new profile. Cleanest
cache invalidation for a derived cache.

### Mode 3: Recommendation pipeline

The most elaborate of the four. Four steps, kicked off as a background job
the frontend polls.

**Step 1 — Candidate generation** (Claude call). The model gets the profile
+ library, returns a `CandidatesOutput`:

- `titleSuggestions`: ~15-20 specific titles with `mediaType` + `reason`.
  Treated as fuzzy search hints; misses dropped silently.
- `discoveryQueries`: 3-8 genre-based queries per format.

**Two prompt-level safeguards** address Sonnet's training biases:

- **Anti-bias section** names its documented favorite fallback works
  (FROM, The Unconsoled, Yi Yi, Planescape: Torment) and tells the model
  these are known offenders — only suggest one of them when the profile
  contains specific signal pointing to it.
- **Profile anchoring rule** requires every suggestion's `reason` to cite
  a specific theme/archetype/library item from THIS profile. Generic
  reasons ("strong character work") are flagged as failures with worked
  good/bad examples in the prompt.

**Step 2 — Real-candidate validation** (parallel adapter calls). Each title
fuzzy-searched against the right adapter; each genre query searches that
adapter. Hits cached in `media_cache`. Critical rule: **every recommendation
must correspond to a real `media_cache` row**. Hallucinated titles silently
drop; users never see something that isn't in the cache.

`Promise.allSettled` parallelizes both loops across adapters. Each adapter
has its own token bucket, so concurrent calls to the same adapter serialize
naturally while cross-adapter calls run in parallel. `allSettled` (not
`all`) ensures one failed search doesn't kill the batch.

**Step 3 — Scoring** (Claude call). The model gets the profile + library +
~60 candidate cards (each with title, year, genres, rating, ~600-char
synopsis) and returns 20-40 `recommendations` with `matchScore`,
`explanation`, `tasteTags`. Two ordered rules in the prompt:

- **Rule 1 — Drop misfits** always wins. A candidate that violates an
  avoidance, contradicts a `dislikedTitle`, is tonally wrong, or off-topic
  gets dropped. No exception.
- **Rule 2 — Volume target** is secondary. Aim for ≥20 recs but never
  pad with misfits.

The collision case is named explicitly: "Included only to meet volume" was
literal text the prior prompt produced; the new prompt names that phrase as
diagnostic of a Rule 1 violation.

**Step 4 — Persistence.** Recommendations rows linked to a
`recommendation_batches` row (created at the top of the pipeline so the FK
exists when persistence runs).

**Cross-cutting concerns:**

- **`canonicalizeTitle` + `matchesKnown`** — collapse "Planescape: Torment",
  "Planescape: Torment Enhanced Edition", "Planescape Torment - Digital
  Deluxe", and "Republic, The" all to canonical forms. Multi-pass regex
  handles stacked suffixes ("Enhanced Edition - Digital Deluxe"). Bidirectional
  prefix-with-separator matching catches "Pathologic 2: Marble Nest" against
  known "Pathologic 2".
- **Cross-batch dedup.** Every batch's `seenCanonicals` set is seeded with
  canonicals of all prior recs. "Vinland Saga" in batch 1 prevents "Vinland
  Saga Season 2" from showing up in batch 2 — different cache rows, same
  work-cluster from the user's perspective.
- **Avoid set.** Recs the user skipped or rated 1-2, library items rated
  1-2, and `profile.dislikedTitles` all flow into the candidate filter
  before scoring.
- **Format-aware prompting.** `detectExplicitFormat("a movie that'll make
  me cry")` returns `"movie"` and overrides the breadth rule with an
  ≥80% format-bias instruction. Without this, asking for movies still got
  manga suggestions to satisfy "format spread".

### Mode 4: Discovery themes

`GET /api/discover/themes` returns 6 cached browse-mode themes; generates
synchronously on first call (~3-5s, acceptable to block on for a one-time
cost).

Each theme: `{ title, description, formats[], promptHint }`. Click → the
standard async generation pipeline runs with `promptHint` as the prompt.

**The hard part of this prompt is fighting genericity.** The whole point is
tailored entry surfaces — "Sci-fi favorites" or "Hidden gems" defeats the
feature. The prompt has an explicit failure test: *"could this description
appear, unchanged, on someone else's account? if yes, you've failed"*. Worked
good/bad examples in the prompt show the gap.

### Evaluate mode ("Would I like X?")

Two-step user flow: search → pick → score.

- `POST /api/evaluate/search { title, mediaType }` — top-3 hits from the
  right adapter, no scoring.
- `POST /api/evaluate/score { mediaCacheId }` — runs the verdict prompt on
  the chosen candidate, returns `{ matchScore, verdict, tasteTags }` plus
  status flags.

**Status flags are deterministic, not AI-generated:** `inLibrary`,
`inSavedRecs`, `rejectedBefore`, `inDislikedTitles`, `previouslyRecommended`
— all computed from DB queries against the user's own state.

**The verdict prompt is allowed to be negative.** This is the differentiator
from the rec scoring path, which biases toward inclusion. The user has
chosen this title and is asking "would I like this?" — a "no, here's why"
is a legitimate answer. The prompt explicitly says: if the title is on
`dislikedTitles` or matches an avoidance, address it directly, don't pretend
you didn't see it.

---

## 5. Media adapter system

Four adapters under `services/media/`:

| Adapter            | Source         | Media types     |
| ------------------ | -------------- | --------------- |
| `tmdbAdapter`      | TMDB           | movie, tv       |
| `igdbAdapter`      | IGDB + Twitch  | game            |
| `jikanAdapter`     | Jikan (MAL)    | anime, manga    |
| `openLibraryAdapter` | Open Library | book            |

**Common interface:**

```ts
interface MediaApiAdapter {
  searchByTitle(title: string): Promise<MediaItem[]>;
  searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]>;
  getById(externalId: string): Promise<MediaItem | null>;
}
```

The aggregator (`getAdapterForType`) routes media types to adapters.
`searchAndCacheByTitle` and `searchAndCacheByQuery` in `mediaCache.ts` wrap
adapter calls with cache writes (upsert keyed on `(source, external_id)`).

**Per-adapter rate limiting** via token bucket (`lib/rateLimiter.ts`):

| Adapter      | Limit            | Notes                                                |
| ------------ | ---------------- | ---------------------------------------------------- |
| TMDB         | 40 req / 10s     | Generous; rarely hit                                  |
| IGDB         | 4 req / s        | Combined with Twitch OAuth tokens                     |
| Jikan        | 1 req / 500ms    | Aggressive; retries on 429 with `Retry-After` backoff |
| Open Library | 5 req / s        | Self-imposed; they don't publish a hard limit         |

**Adapter-specific quirks worth knowing:**

- TMDB title search returns mixed types ("dune" matches movies *and* TV);
  filter to `query.mediaType` before caching.
- IGDB uses Apicalypse query language. Combining `search` with `where
  category in (...)` returns zero results — filter category client-side
  via `isStandaloneCategory` instead.
- Jikan rate limiting is the strictest of the four; aggressive retry-with-
  backoff keeps the pipeline alive without bursting.
- Open Library indexes scholarly companion works alongside novels (essays,
  study guides, critical companions). `SCHOLARLY_TITLE_PATTERNS` regex
  array filters them in `searchByTitle` and `searchByQuery` before
  normalization.

---

## 6. Auth flow

Clerk handles all OAuth (Google + GitHub).

**Frontend.** `<SignIn />`, `<SignUp />` components. Session token attached
automatically by `useApi()` → `apiFetch` → `Authorization: Bearer <token>`.

**Backend.** `clerkMiddleware()` runs on every route under `/api`. The
`requireUser` middleware then:

1. Reads `userId` from the parsed Clerk session.
2. Looks up the local `users` row by `clerk_id`.
3. If missing (first login), syncs from Clerk and inserts the row.
4. Attaches the local user to `req.user` for handlers.

**No webhooks needed** — the on-demand sync at the first authenticated
request is simpler than a Clerk webhook handler and has no extra moving
parts. Trade-off: the first request after sign-up costs an extra Clerk API
call.

**Defense in depth.** Every userId-scoped query *also* explicitly filters by
`user_id` even though Clerk + middleware already gate access. Belt and
suspenders against a future bug in the auth chain.

---

## 7. Job system

`services/jobs.ts` is an in-memory job tracker. Long-running work
(recommendation generation, ~30-90s) starts a job, returns a `jobId`, and
the frontend polls.

**API:**

- `POST /api/recommendations/generate` → `{ jobId, status }` (202)
- `GET /api/recommendations/generate/:jobId` → status + (when complete)
  joined recommendations
- `GET /api/recommendations/active-job` → user's currently-running job, or
  `{ jobId: null }`

**Frontend mount-time resume.** `useRecommendations` does an
`/active-job` check on mount; if a job is running, it picks up the poll
loop. So a page reload mid-generation seamlessly resumes.

**Trade-offs / known limitations:**

- Lost on process restart. Acceptable for current scale; in production this
  would swap to a Postgres-backed jobs table or Redis.
- Single-process. Multi-instance deployment would require the same swap.
- Jobs prune 1 hour after completion; users who reload long after the fact
  get `404 job not found` and have to re-generate.

---

## 8. Frontend architecture

**React Router v7** with a `Layout` route wrapping all pages with `Nav`.
Routes that require auth nest under a `RequireAuth` element.

**Hook pattern.** Every major data domain has a `useX` hook that owns its
state, API calls, and optimistic updates. Components stay presentational.

| Hook                  | Responsibility                                         |
| --------------------- | ------------------------------------------------------ |
| `useProfile`          | Fetch profile, refine, update (manual edits)           |
| `useRecommendations`  | List recs, generate (poll), feedback, rescore         |
| `useBatches`          | List, rename, delete batches                          |
| `useLibrary`          | List, add, remove, import-CSV, clear                  |
| `useThemes`           | Fetch + refresh discovery themes                      |
| `useEvaluate`         | Search → pick → score state machine                   |
| `useOnboarding`       | Streaming chat state, send, complete                  |

**Why hooks not Redux/Zustand.** Each hook's domain is well-bounded; no
cross-domain shared state needed. Hooks colocate state with the API they
call. If a feature ever needs cross-domain state (sharing? collab?) we'd
revisit.

**Reusable patterns:**

- **Edit-vs-view toggle** (`ProfilePage`). Same page swaps between
  `ProfileView` (read-only) and `ProfileEditor` (form). Local-only mutations
  in the editor until Save → `PUT /api/profile`. Cancel discards.
- **Async polling pattern** (`useRecommendations`). Mount checks for
  active job; `generate()` starts a poll loop; `cancelledRef` kills the
  loop on unmount.
- **Optimistic feedback** (`setFeedback`). Updates local state
  immediately, rolls back on error.
- **Scroll-to-hash** (`ProfilePage`). `/profile#library` jumps to the
  library section after the data renders.

---

## 9. Notable design decisions

The interview-relevant section. Each is a defensible call worth being able to
articulate.

**JSONB for taste profile.** Hierarchical, always atomic, schema evolves via
TypeScript + zod. The field gained `dislikedTitles` mid-project without a DB
migration. Normalized tables would mean 4-way joins on every read and
transactional 4-way writes on every save. Wrong shape for this data.

**zod v4 for AI structured output.** Same schema serves as the model
contract (constrains generation) and the runtime validator (defense in
depth). v3/v4 mismatch in the SDK's own type declarations forced the
`as unknown as Parameters<...>` casts; documented in the schemas file.

**Deterministic readiness floor for onboarding.** Models fire `<ready/>`
against thin transcripts. Server-side floor (`≥5 turns + ≥200 user words`)
silently drops the signal otherwise. Hybrid model + deterministic gate.

**`canonicalizeTitle` for series/edition collapse.** Adapter responses
bring multiple titles for the same work. Multi-pass regex strip +
bidirectional prefix-with-separator matching collapses them to a canonical
form. Critical for cross-batch dedup; without it, "Vinland Saga" and
"Vinland Saga Season 2" appear as separate works in successive batches.

**Anti-bias prompt section.** Sonnet 4-6 has a documented bias toward
"smart picks" (FROM, The Unconsoled, Yi Yi, Planescape: Torment) that
appear regardless of profile. Prompt names the offenders explicitly +
profile-anchoring rule (every suggestion must cite a specific profile
element). User-named offenders feed back into this list as we discover
more.

**Parallel adapter fan-out via `Promise.allSettled`.** Each adapter has
its own token bucket; concurrent calls to the same adapter serialize
naturally; cross-adapter calls run truly parallel. `allSettled` keeps a
single failed search from killing the batch — critical when one adapter is
flaky.

**Cache invalidation on profile change.** `discovery_themes` are derived
data; on every `saveProfile` the row is deleted. Next visit regenerates
against the current profile. Cleanest invalidation strategy when the cache
is purely a function of upstream state.

**`StreamFilter` for tag boundaries.** SSE chunks split mid-tag; naive
matching leaks `"<analy"` to the user. Filter buffers the longest possible
partial-tag suffix and only emits the safe prefix. 14 hand-runnable tests.

**Drop-rules-beat-volume-rule in scoring.** Earlier prompt produced
explanations like *"included only to meet volume requirement"* against
profile-violating candidates. Reframed scoring around two ordered rules
with that exact phrase named as a diagnostic. Failure-mode-by-name in
prompts prevents regression.

**On-demand user sync (no webhook).** Auth middleware syncs Clerk user data
on the first authenticated request. Simpler than running a webhook handler;
trade-off is a one-time extra API call per user.

**Drizzle migrations as editable SQL.** Auto-generated migrations
occasionally need a manual fix (e.g. backfilling rows before adding an FK
constraint to an existing column). Editable SQL files made that recoverable
without abandoning the migration system.

---

## 10. Known limitations / what's not built

What's deferred is part of the design. Articulating it shows judgment.

- **No test coverage** beyond a 14-case streaming-filter smoke test
  (`streaming.test.ts`). For production this would be a P0; for a portfolio
  piece it's a known gap.
- **Single-instance only.** The job tracker is in-memory. Multi-instance
  deployment requires swapping to a Postgres- or Redis-backed jobs table.
- **MAL + Steam library imports deferred.** Goodreads + Letterboxd shipped
  (CSV); MAL needs an XML parser, Steam needs the Web API + a SteamID
  input UX + a `STEAM_API_KEY` env var. Designs sketched, not built.
- **No profile version rollback UI.** `profile_versions` stores history
  but there's no viewer/restore interface yet.
- **Mobile not deeply tested.** Layout is responsive (Tailwind
  breakpoints, horizontally-scrollable nav, stacked cards on narrow
  viewports) but no phone-in-hand pass.
- **No accessibility audit.** No screen-reader testing, no keyboard-nav
  verification beyond browser defaults.
- **Not deployed.** Vercel-ready but not live. Required env vars:
  `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `TMDB_API_KEY`,
  `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`.
- **Job results in-memory.** Pruned 1 hour after completion. A user who
  reloads several hours after a generation finished gets a 404 and has to
  re-generate.
- **No batch sharing.** A "share this batch" link could let a friend view
  a user's recommendations. Not in scope.
- **Limited rate-limit recovery.** Adapter 429s have retry-with-backoff,
  but a sustained outage would silently produce empty batches. Surfacing
  an "external API is slow" status to the user would be more honest.
- **Discovery themes blocking on first visit.** First `/explore` GET takes
  3-5s while themes generate. Could be moved to a background job + polling
  pattern, but the trade-off (job complexity for a one-time wait) wasn't
  worth it.
- **No "rerun this batch" affordance.** If a batch's quality was off, the
  user has to re-prompt manually. A "rerun with these tweaks" flow would
  be a natural addition.

These are deliberate scope boundaries, not unknown bugs. The system's
cohesion comes partly from saying no to the wrong-shape additions.
