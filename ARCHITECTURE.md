# Architecture

This is the architecture reference for Resonance — the _why_ behind decisions,
not just the _what_. Walks every subsystem, its role in the larger pipeline,
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
   has saved or imported, e.g. _"the same fractured-interior-concealed-by-
   performance architecture you found in No Longer Human and Goodnight
   Punpun"_. This is the differentiation moment.
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
  model _proposes_, the system _verifies_. Hallucinated titles silently
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
  _an application_ — multiple users, isolated profiles, isolated libraries,
  shareable URLs, auth. Claude.ai is a tool _you_ use repeatedly. Different
  shape, different problem.

The senior take is: AI is a component, not the whole system. Models do what
models are great at — reading taste, finding creative connections, scoring
novel candidates. Traditional engineering — adapters, deduplication, schema
validation, rate limiting, persistence, workflow orchestration — does what
it's good at. The product is in how those layers compose. This codebase is
partly an exercise in finding _exactly_ where that boundary sits.

---

## 2. Stack

| Layer         | Choice                                                                           |
| ------------- | -------------------------------------------------------------------------------- |
| Frontend      | React 19 + TypeScript, Vite 6, Tailwind v4, react-router-dom v7                  |
| Backend       | Node + Express 4, Vercel-ready serverless                                        |
| Database      | PostgreSQL on Neon (HTTP driver), Drizzle ORM 0.38                               |
| Auth          | Clerk (`@clerk/express`, `@clerk/clerk-react`)                                   |
| AI            | `@anthropic-ai/sdk`, `claude-sonnet-4-6`                                         |
| External APIs | TMDB (movies/TV), IGDB+Twitch (games), Jikan (anime/manga), Open Library (books) |
| Validation    | zod v4 (via `import { z } from "zod/v4"`)                                        |
| Build / repo  | pnpm monorepo: `apps/client`, `apps/server`, `packages/shared`                   |

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

| Table                    | Stores                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----------- |
| `users`                  | Clerk-synced user rows (clerk_id, email, onboarding_status)                                               |
| `taste_profiles`         | Current profile per user (one row per user, JSONB profile_data)                                           |
| `profile_versions`       | Historical profile snapshots, `trigger` enum (onboarding/feedback_batch/manual_edit)                      |
| `onboarding_sessions`    | Full chat transcripts, JSONB `messages` array                                                             |
| `media_cache`            | Normalized external-API data — the anti-hallucination layer                                               |
| `recommendation_batches` | First-class batch objects (name, prompt, timestamps)                                                      |
| `recommendations`        | Every rec ever, joined to a batch + a media_cache row + status/rating                                     |
| `library_items`          | Imported (Letterboxd / Goodreads / MyAnimeList / Steam) or manually-added works. `status` enum: `consumed | watchlist`. |
| `discovery_themes`       | Cached browse-mode entry surfaces, regenerated on profile change                                          |

**Key constraints worth knowing:**

- `unique(user_id, media_cache_id)` on `recommendations` — same media never
  recommended twice to the same user. Insert via `onConflictDoNothing`.
- `unique(user_id, media_type, title)` on `library_items` — re-importing the
  same Letterboxd CSV is idempotent.
- `unique(source, external_id)` on `media_cache` — TMDB id 1234 stored once
  across all users; cache is shared.
- `media_type` is a Postgres enum (`movie | tv | anime | manga | game | book`)
  used in five tables — single source of truth.
- `recommendations.status` is the enum `pending | seen | saved | skipped |
rated | plan_to`. `plan_to` was added when watchlist support shipped; it
  pairs with a corresponding `library_items` row at `status = "watchlist"`.
- `library_items.status` is the enum `consumed | watchlist`, default
  `consumed`. Watchlist items contribute to the recommender's dedup pool but
  NOT to the library cross-reference set (the user hasn't actually engaged
  with them yet — using them as anchors in explanations would lie).
- `library_items.fit_note` (text, nullable), `taste_tags` (text[], default
  `'{}'`), and `annotated_at_profile_version` (integer, nullable) carry
  per-item AI annotation. Populated only for `source = "manual"` AND
  `status = "consumed"` rows; bulk-imported and watchlist rows stay
  null/empty. Powers Constellation's per-item detail panel and replaces a
  brittle title-substring fallback in its graph builder. See §4 "Library
  annotation mode" and §10 "Per-item library annotation".

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

### Mode 1b: Fast-mode onboarding (form-based)

`POST /api/onboarding/fast` is the synchronous, non-streaming counterpart
to the chat. The user fills out a guided form (titles per format, narrative
shape picks, avoidances) and the server runs a single extraction call against
the form payload. Same `TasteProfile` output as long mode — Constellation/
Ensemble export contracts are unaffected.

**Why it exists.** Real-user feedback flagged the chat as too long.
Fast-mode is a shorter on-ramp; long mode is preserved as the "deeper
profile" option and reachable via the link from the chat starter card.

**Pipeline:**

1. `checkRateLimit("onboarding.fast")` (5/day cap — one-shot calls don't
   legitimately need more).
2. zod-validate the form payload (`fastOnboardingSchema`); enforce ≥4 named
   titles total.
3. Persist the payload as a single user message in a fresh
   `onboarding_sessions` row (so `getLatestSession` and the continued-
   onboarding branch in `/complete` keep working without schema changes).
4. **First-time profile** → `extractProfileFromForm(input)` calls the model
   with `fastExtractionSystemPrompt()` + `TasteProfileSchema` constraint.
   **Existing profile** → `evolveProfileFromTranscript` so a fast-mode
   submission on top sharpens rather than overwrites (same idempotency
   pattern long mode uses).
5. **Server overlay on `mediaAffinities`** — entries the user disabled in
   the form are dropped; missing entries for enabled formats are
   synthesized from title counts (0 titles → 0.3 comfort, 1-2 → 0.6,
   3+ → 0.85). The format-disable rule is server-enforced regardless of
   what the model proposed (CLAUDE.md "format enable/disable is
   server-enforced").
6. `saveProfile` with `trigger="onboarding"` (same trigger as long mode).
7. `markSessionCompleted` + `markOnboardingComplete`.

**Differences from long-mode extraction prompt.** The fast-mode prompt
tells the model: themes/archetypes are inferred from titles + narrative
picks (not from rich self-report); fewer themes is correct; pacing/
complexity/tone pass through as user-supplied; never invent affinities
from formats with no titles. Profiles are intentionally thinner —
the auto-refine loop sharpens them on first feedback batch.

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

- library, returns a `CandidatesOutput`:

* `titleSuggestions`: ~15-20 specific titles with `mediaType` + `reason`.
  Treated as fuzzy search hints; misses dropped silently.
* `discoveryQueries`: 3-8 genre-based queries per format.

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
- **Format enable/disable hard enforcement.** `collectRealCandidates` drops
  any candidate whose `mediaType` isn't in the user's `mediaAffinities`
  before it ever reaches scoring. Belt-and-suspenders alongside the prompt
  rule that lists disabled formats explicitly. Removing a format from the
  ProfileEditor _literally guarantees_ it won't appear in future batches.
- **Refine flow ("stacked batches").** Each batch on the recommendations
  page has a Refine button. Click → inline input → submit constructs a new
  prompt as `"${original}, but also: ${addition}"` and kicks off a brand
  new batch via the standard pipeline. The original batch is never mutated;
  refinement is additive — the user ends up with the original AND the
  refined version, both browsable.
- **Watchlist + plan-to in dedup.** A rec marked "Plan to" flips its
  `status` to `plan_to` AND creates a `library_items` row at
  `status="watchlist"`. Imported watchlists (Goodreads to-read, MAL plan-to,
  Steam wishlist if it ever returns) take the same shape. All watchlist
  items canonicalize into `previouslyRecommendedTitles` so they're never
  re-surfaced as new recs. They do NOT enter the cross-reference library —
  user hasn't experienced them.

### Mode 4: Discovery themes

`GET /api/discover/themes` returns 6 cached browse-mode themes; generates
synchronously on first call (~3-5s, acceptable to block on for a one-time
cost).

Each theme: `{ title, description, formats[], promptHint }`. Click → the
standard async generation pipeline runs with `promptHint` as the prompt.

**The hard part of this prompt is fighting genericity.** The whole point is
tailored entry surfaces — "Sci-fi favorites" or "Hidden gems" defeats the
feature. The prompt has an explicit failure test: _"could this description
appear, unchanged, on someone else's account? if yes, you've failed"_. Worked
good/bad examples in the prompt show the gap.

The prompt also surfaces the user's **disabled formats** explicitly so
themes never include those formats in their `formats` list — same
enforcement as the recommender's candidate prompt.

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

**Format selector is filtered by enabled formats.** The dropdown only
shows formats the user has in `mediaAffinities` — disabling a format
removes it from the evaluate dropdown too. Symmetric with how disabled
formats are excluded from rec batches and theme cards.

### Library annotation mode

Single-item structured-output call. Tags one library item against the
user's active profile and returns:

- `fitNote` — 1-2 sentences explaining why THIS specific title fits THIS
  specific profile. Item-specific (not a generic theme summary).
- `tasteTags` — 1-4 canonical theme/archetype labels, copied verbatim from
  the profile. Filtered server-side against the known label set; invented
  labels are dropped silently.

**When it runs.** Inline on `POST /api/library` and on `PATCH
/api/library/:id` when the patch promotes a row from watchlist → consumed.
Eligibility check is on the row, not the route: `source === "manual" &&
status === "consumed"`. Watchlist items, bulk imports (Letterboxd /
Goodreads / MAL / Steam), and any pre-promotion row stay un-annotated.
Annotation failure is best-effort — the row is already saved, so a model
error or rate-limit hit logs and returns the un-annotated row instead of
rolling back the insert.

**Why inline instead of an async job.** Manual library adds are explicit
"I want this saved with rationale" actions. ~4-6s wait at the response is
acceptable for an explicit save; the job-tracker pattern was overkill for
a one-shot per-item call. If the latency becomes a UX problem, the swap is
straightforward (return the row immediately with `annotation_status:
"pending"`, fire-and-forget the annotation, let the client poll).

**Stale-on-refinement strategy: ship stale.** When `saveProfile` runs
(refinement, manual edit), existing fitNotes are technically frozen
against the prior profile version. We do NOT lazy-regen on read in
`/export` — a user with 30 manual items would block their export for 60+
seconds after every refinement. Theme drift is gradual; fitNotes degrade
gracefully. `annotated_at_profile_version` records the version active at
generation so a future on-demand "regen this fitNote" affordance can
detect drift without timestamp comparisons.

**Trimmed prompt payload.** The model receives `themes` + `archetypes`
only — `narrativePrefs` doesn't drive cluster tags, and including
`mediaAffinities[].favorites` while annotating an item that's itself a
favorite would create a self-referential loop. Worth ~30% on input tokens
per call.

**Backfill script.** `apps/server/src/scripts/backfillLibraryAnnotations.ts`
finds manual+consumed rows with `fit_note IS NULL` and annotates them
sequentially. Per-item failures leave the row alone and continue;
re-running picks up exactly the rows that didn't get annotated. Run from
a local machine pointed at the target DB via `DATABASE_URL`.

### `/api/profile/export` — the Constellation contract

Read-only aggregated snapshot consumed by [Constellation](https://github.com/Drubnerw98/Constellation),
a force-directed visualization companion. Returns:

- `profile` — the full `TasteProfile` JSONB.
- `library` — manual `library_items` only, with `fitNote`, `tasteTags`, and
  `status` per row. Imports filter out at the query boundary so the
  payload stays small. The `source` field is the synthetic constant
  `"library"` (the row's actual `source` is `"manual"`); Constellation's
  type pins this literal.
- `recommendations` — every rec, deduped by `mediaCacheId`, with
  `tasteTags` and `explanation`.
- `favorites` — derived from `profile.mediaAffinities[].favorites`. Each
  flat title is paired with theme/archetype labels via title-substring
  matching against `theme.evidence` and `archetype.attraction` (the same
  two-stage match Constellation's graph builder uses internally —
  normalized substring, then 2+ content-token overlap). Zero AI cost,
  pure structural derivation. Untagged favorites still ship; the consumer
  drops them via its unanchored-node filter.
- `avoidances` — flat list of `{ description, kind: "pattern" | "title" }`
  derived from `profile.avoidances` and `profile.dislikedTitles`.

**Why expose favorites separately rather than as library rows.** Favorites
live in the profile JSONB as flat title strings — they were extracted by
the AI during onboarding ("what shows have you loved?") and never written
to `library_items`. Surfacing them as first-class export entries is the
cheapest density win available for the constellation: ~25-30 additional
high-signal nodes per active user, no AI cost.

---

## 5. Media adapter system

Four adapters under `services/media/`:

| Adapter              | Source        | Media types  |
| -------------------- | ------------- | ------------ |
| `tmdbAdapter`        | TMDB          | movie, tv    |
| `igdbAdapter`        | IGDB + Twitch | game         |
| `jikanAdapter`       | Jikan (MAL)   | anime, manga |
| `openLibraryAdapter` | Open Library  | book         |

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

| Adapter      | Limit         | Notes                                                 |
| ------------ | ------------- | ----------------------------------------------------- |
| TMDB         | 40 req / 10s  | Generous; rarely hit                                  |
| IGDB         | 4 req / s     | Combined with Twitch OAuth tokens                     |
| Jikan        | 1 req / 500ms | Aggressive; retries on 429 with `Retry-After` backoff |
| Open Library | 5 req / s     | Self-imposed; they don't publish a hard limit         |

**Adapter-specific quirks worth knowing:**

- TMDB title search returns mixed types ("dune" matches movies _and_ TV);
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

### Library imports (separate from the recommender's adapters)

User-driven imports go through different code paths than the recommender's
adapter calls — they're file uploads (CSV/XML) or a dedicated API
integration, not part of the candidate-collection pipeline.

| Source      | Shape      | Watchlist support               | Notes                                                      |
| ----------- | ---------- | ------------------------------- | ---------------------------------------------------------- |
| Letterboxd  | CSV upload | Deferred (`watchlist.csv`)      | `parseLetterboxdCSV` — ratings.csv/watched.csv             |
| Goodreads   | CSV upload | Yes — to-read shelf             | `parseGoodreadsCSV` — read → consumed, to-read → watchlist |
| MyAnimeList | XML upload | Yes — Plan to Watch/Read        | `parseMyAnimeListXML` — anime + manga, score 1-10 → 1-5    |
| Steam       | Web API    | Deferred (Valve gated wishlist) | `services/steam.ts` — owned games via SteamID/URL/vanity   |

**Steam-specific:** `STEAM_API_KEY` env var is optional; without it the
import button surfaces a clear error rather than crashing. SteamID input
accepts a 64-bit ID, a `/profiles/` URL, or a vanity name (resolved via
`ResolveVanityURL`). Owned games come in as `consumed` with no rating —
playtime is too noisy to map to a star rating.

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

**Defense in depth.** Every userId-scoped query _also_ explicitly filters by
`user_id` even though Clerk + middleware already gate access. Belt and
suspenders against a future bug in the auth chain.

---

## 7. Job system

`services/jobs.ts` is a Postgres-backed job tracker. Long-running work
(recommendation generation, ~30-90s) starts a job, returns a `jobId`, and
the frontend polls.

**Table:** `jobs (id, user_id, kind, status, started_at, heartbeat_at, completed_at, error, result)`. Status enum: `pending | running | completed | failed`. Indexed on `(user_id, kind, status)` for the active-job lookup.

**API:**

- `POST /api/recommendations/generate` → `{ jobId, status }` (202)
- `GET /api/recommendations/generate/:jobId` → status + (when complete)
  joined recommendations
- `GET /api/recommendations/active-job` → user's currently-running job, or
  `{ jobId: null }`

**Frontend mount-time resume.** `useRecommendations` does an
`/active-job` check on mount; if a job is running, it picks up the poll
loop. So a page reload mid-generation seamlessly resumes.

**Crash recovery.** On boot, `recoverOrphanedJobs()` flips any leftover
`running` rows to `failed` with `error="process restarted during job"`.
A polling client gets a real status next tick instead of waiting forever.
This is single-instance-safe (no other process is legitimately running
those jobs). Workers also write a heartbeat every 30s; any `running` row
whose heartbeat is older than 5 min is treated as dead by
`findActiveJobForUser` so a hung worker doesn't trap the client either.

**Cleanup.** Completed/failed rows live for 7 days, then a hourly periodic
delete prunes them. Keeps recent history available for debugging without
unbounded growth.

**Trade-offs / known limitations:**

- Single-instance only. Going multi-replica needs an atomic claim in
  `startJob` — `UPDATE jobs SET status='running' WHERE id=$1 AND status='pending' RETURNING ...` — and the route handler inserting with `status='pending'` instead of `'running'`. One SQL statement; deferred until we actually scale out.
- Result payload stored as JSONB on the row. For the recommendation
  pipeline this is `{ count, batchId, recommendationIds }` — small, but
  in principle a runaway result could bloat the row. The schema doesn't
  enforce a size cap; would add one if/when result shapes grow.

---

## 8. Rate limiting + abuse prevention

`services/rateLimit.ts` enforces per-user daily caps on every AI-bound
endpoint. Without these, a single authenticated user could hammer the
Anthropic budget by automating the onboarding chat or the rec generator.

**Caps (per user, UTC day):**

| Endpoint                             | Cap | Kind                       |
| ------------------------------------ | --- | -------------------------- |
| `POST /api/onboarding/message`       | 100 | `onboarding.message`       |
| `POST /api/onboarding/fast`          | 5   | `onboarding.fast`          |
| `POST /api/recommendations/generate` | 25  | `recommendations.generate` |
| `POST /api/evaluate/score`           | 100 | `evaluate.score`           |
| `POST /api/discover/themes/refresh`  | 20  | `discover.refresh`         |
| `POST /api/profile/refine`           | 10  | `profile.refine`           |
| `POST /api/library` + `PATCH /api/library/:id` (annotation only) | 100 | `library.annotate`         |

**Mechanics:** in-memory `Map<"userId:kind", { count, resetAt }>`. Reset at
the next UTC midnight; expired buckets pruned hourly. Over the cap →
status-coded error with `status: 429` + a clear message; the global
errorHandler surfaces it as a JSON 429 response.

**Critical placement:** `checkRateLimit()` runs BEFORE the expensive call
(model invocation, adapter fan-out), not after. For the onboarding SSE
stream the check happens before the SSE writer is opened so a 429 lands
as a clean HTTP response rather than mid-stream noise. For
`/recommendations/generate` the existing job-deduper runs first, so
re-attaching to an in-flight job doesn't double-count.

**What's NOT rate-limited:** GET endpoints (cheap), evaluate's adapter
search (no Claude call), library imports (parsing or Steam API which has
its own quota), feedback PATCH (no Claude call), the discover GET
auto-generate (one-time per user; the refresh endpoint IS limited).

**Limitation:** in-memory like the job tracker. A multi-instance deploy
would let a user route around the limit by hitting different replicas.
Postgres-backed counter would fix it; not built since we're single-instance.

---

## 9. Frontend architecture

**React Router v7** with a `Layout` route wrapping all pages with `Nav`.
Routes that require auth nest under a `RequireAuth` element.

**Hook pattern.** Every major data domain has a `useX` hook that owns its
state, API calls, and optimistic updates. Components stay presentational.

| Hook                 | Responsibility                                |
| -------------------- | --------------------------------------------- |
| `useProfile`         | Fetch profile, refine, update (manual edits)  |
| `useRecommendations` | List recs, generate (poll), feedback, rescore |
| `useBatches`         | List, rename, delete batches                  |
| `useLibrary`         | List, add, remove, import-CSV, clear          |
| `useThemes`          | Fetch + refresh discovery themes              |
| `useEvaluate`        | Search → pick → score state machine           |
| `useOnboarding`      | Streaming chat state, send, complete          |
| `useFastOnboarding`  | Fast-mode form submission, profile creation   |

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

## 10. Notable design decisions

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
explanations like _"included only to meet volume requirement"_ against
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

**Watchlist as dedup signal, not cross-reference signal.** A user adding
_The Bear_ to their watchlist means "I'm aware of it, want to watch it
eventually" — not "I love this and you can use it as an anchor." So
watchlist items go into `previouslyRecommendedTitles` (dedup) but
`getUserLibrary` filters them out (no cross-references). This split was
the central design call when watchlist support shipped; without it, recs
would explain themselves with works the user has never actually
experienced.

**Format enable/disable hard-enforced server-side, not just prompted.**
The candidate prompt tells the model to skip disabled formats; the
discovery-themes prompt does the same. But `collectRealCandidates` ALSO
hard-filters by `mediaAffinities` before scoring — even if the model
violates the prompt rule, the server enforces it. The frontend
ProfileEditor's "Disable" button has real teeth: removing a format from
the affinities array literally guarantees no recs in that format ever
again until re-enabled.

**Refine creates a new batch, never mutates the original.** Stacking
`"original prompt, but also: ${addition}"` is the user's mental model —
they want to KEEP the original batch's results AND see how a refinement
changes things. Mutating the existing batch would force the user to
choose which version to lose. New-batch refinement preserves both.

**Per-item library annotation, inline on save.** Manual library adds get
a 1-2 sentence AI rationale + 1-4 canonical theme/archetype tags written
to the row at insert time (and on watchlist→consumed promotion). Powers
Constellation's per-item detail panel and replaces a brittle
title-substring fallback in its graph builder. Three sub-decisions worth
naming: **inline blocks the response** (~4-6s; acceptable for an explicit
save action, easy to swap to async if it bites); **filter eligibility on
the row, not the route** (multiple import paths, defense-in-depth); **ship
stale annotations after profile refinement** (theme drift is gradual,
fitNotes degrade gracefully — lazy-regen-on-read would block exports for
60+ seconds on power-user libraries). Same schema-as-contract +
schema-as-validator pattern as the other AI modes; trimmed prompt payload
(themes + archetypes only) avoids the favorite-annotating-itself loop.

**`/api/profile/export` is a downstream-consumer contract.** The
visualization companion (Constellation) reads this endpoint as its sole
data source. The shape is intentionally flat (no per-batch nesting) and
the `library[].source` literal is a synthetic constant `"library"` — the
row's actual `source` is `"manual"`, but the export label has been pinned
since the endpoint shipped and the consumer's TypeScript type matches.
Don't break the contract for a renamed string. The endpoint also derives
`favorites` and structured `avoidances` from the profile JSONB at zero AI
cost — the cheapest density win available for the visualization.

**Per-user rate limits live next to the job tracker, not in middleware.**
`services/rateLimit.ts` is a sibling of `services/jobs.ts`; both are
in-memory, both have the same multi-instance trade-off. Putting limits in
middleware would require knowing the route's "kind" enum at registration
time; a service-level helper at each call site is more local and lets
each route decide the cap kind. Cost: explicit `try/catch` blocks at each
route — verbose but unambiguous.

---

## 11. Known limitations / what's not built

What's deferred is part of the design. Articulating it shows judgment.

- **No test coverage** beyond a 14-case streaming-filter smoke test
  (`streaming.test.ts`) and a few inline media-cache + rate-limiter smoke
  scripts. For production this would be a P0; for a portfolio piece it's a
  known gap.
- **Single-instance only.** Both the job tracker AND the rate-limit counter
  are in-memory. Multi-instance deployment requires swapping both to
  Postgres- or Redis-backed storage. A user could currently route around
  rate limits by hitting different replicas if there were more than one.
- **No profile version rollback UI.** `profile_versions` stores history
  but there's no viewer/restore interface yet.
- **No accessibility audit.** No screen-reader testing, no keyboard-nav
  verification beyond browser defaults. Form inputs use semantic HTML
  (button, label, role="radiogroup" on stars) but no formal pass.
- **Job results in-memory.** Pruned 1 hour after completion. A user who
  reloads several hours after a generation finished gets a 404 and has to
  re-generate.
- **No recent-evaluations history.** Verdicts are ephemeral — no
  persistence layer for the user's evaluate sessions. Could add as a
  separate table; not in scope yet.
- **No batch sharing.** A "share this batch" link could let a friend view
  a user's recommendations. Not in scope.
- **Limited rate-limit recovery on adapters.** Adapter 429s have
  retry-with-backoff, but a sustained outage would silently produce empty
  batches. Surfacing an "external API is slow" status to the user would
  be more honest.
- **Discovery themes blocking on first visit.** First `/explore` GET takes
  3-5s while themes generate. Could be moved to a background job + polling
  pattern, but the trade-off (job complexity for a one-time wait) wasn't
  worth it.
- **Letterboxd watchlist + Steam wishlist deferred.** Letterboxd's
  `watchlist.csv` parser fits the existing watchlist framework; just not
  wired. Steam wishlist needs OAuth (Valve gated the JSON endpoint).
- **Production Clerk + custom domain not set up.** Currently `pk_test_…`
  on a `vercel.app` subdomain. Cookie quirks on `*.vercel.app` are
  cosmetic (warnings in console, sign-in still works). Switching to
  `pk_live_…` requires owning a real domain.

These are deliberate scope boundaries, not unknown bugs. The system's
cohesion comes partly from saying no to the wrong-shape additions.
