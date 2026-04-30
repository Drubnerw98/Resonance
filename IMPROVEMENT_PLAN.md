# Resonance — External Code Review & Improvement Plan

> An outside-the-team review of the Resonance repository as of April 2026. Written
> for the owner as a hand-off document: framed as observations + concrete
> recommendations, not a critique. The codebase is in unusually strong shape
> for a portfolio-stage project, and most of what's below is about how to push
> it from "polished portfolio" toward "production-ready engineering reference."
>
> This revision adds a contextual layer: it reads Resonance against the owner's
> *canonical stack* — the conventions captured in `~/.claude/conventions/`
> and exemplified in the `crew` and `Recipes` repositories — and reframes
> recommendations through that lens where useful.

---

## 1. Executive summary

Resonance is a thoughtfully architected full-stack TypeScript application that
gets the **hard parts** right and leaves the **easy parts** (formatting,
linting, automated tests, CI) for later. The differentiating engineering
work — anti-hallucination via real-API verification, the streaming tag
filter, prompt caching, profile versioning, cross-batch deduplication — is
not just present but well-executed and explicitly justified in
`ARCHITECTURE.md`.

The recommendation engine is the kind of subsystem that would be hard to
build well even with a senior team and a roadmap; the fact that one developer
shipped it with this much architectural clarity is the headline. The
trade-off, as is often the case, is that the *infrastructure around the
code* — tests, lint configs, CI, observability — hasn't been built yet.
This is fixable cheaply, and the document below maps out where to invest
first.

**TL;DR rankings, 1 = highest leverage:**

| Priority | Theme                                        | Effort | Risk-of-not-doing      | Aligns canon? |
| -------- | -------------------------------------------- | ------ | ---------------------- | ------------- |
| 1        | Add a real test runner (Vitest) + CI         | S      | High (regressions)     | Yes           |
| 2        | Wire up ESLint + Prettier (configs missing)  | XS     | Medium (drift)         | Yes           |
| 3        | Sync `CLAUDE.md` with current architecture   | XS     | Medium (AI confusion)  | Partly        |
| 4        | Refactor 600+ line page components           | M      | Medium (maintainability) | Yes         |
| 5        | Add structured logging (pino) + error tracking | S    | High in production     | Yes           |
| 6        | Persist jobs & rate limits (DB-backed)       | M      | Blocks horizontal scale | Neutral      |
| 7        | Validate env at boot (zod) + secret hygiene  | XS     | Medium                 | Yes (explicit in backend skill) |
| 8        | Build out the deferred features (rollback, MAL, Steam UI) | M      | Low (already scoped)   | N/A   |

The "Aligns canon?" column flags whether the recommendation also moves
Resonance toward your established conventions in `crew` and `Recipes`.
Most do — see §2A for the cross-repo comparison.

---

## 2A. Where Resonance fits in your codebase ecosystem

Reading Resonance alongside `crew` and `Recipes` (and the conventions in
`~/.claude/conventions/{code-quality,node,documentation}.md`) reveals
that you have a **clearly committed canonical stack** for new work — and
Resonance intentionally diverges from it. That's not a problem; it's a
context worth naming, because some of the recommendations above are
"generic best practice" while others are specifically "match what crew +
Recipes already do."

### Stack comparison

| Concern              | Canonical (crew + Recipes)                           | Resonance                                | Comment |
| -------------------- | ---------------------------------------------------- | ---------------------------------------- | ------- |
| Package manager      | npm workspaces                                       | pnpm workspaces                           | Coherent local choice; not worth migrating |
| HTTP framework       | Fastify                                              | Express 4                                 | Pre-canon; Express is fine if layered well |
| DB query layer       | Kysely (+ Better Auth migrations)                    | Drizzle ORM (+ Drizzle Kit migrations)    | Same architectural reasoning, different lib |
| Auth                 | Better Auth                                          | Clerk                                     | Different choice; not worth migrating |
| Validation           | Zod (request bodies, params, env)                    | Zod (request bodies)                      | Match — but env not validated yet |
| DI                   | `@fastify/awilix`, scoped by request                 | None — services imported as modules       | Resonance is below the "second service" threshold per skill, but is climbing toward it |
| Error handling       | Typed errors → `setErrorHandler`                     | `next(err)` → middleware that re-throws   | Resonance is functionally OK but doesn't have a typed-error vocabulary |
| Logging              | `pino` (per backend skill)                           | `console.log` everywhere                  | Diverges from canon |
| Frontend data        | (Recipes) Vike `+data.ts` loaders / TanStack Query   | Bespoke `useX` hooks owning fetch + state | Resonance has a *coherent* custom convention — works fine, is the project's "established pattern" |
| Frontend state       | TanStack Query / Zustand / Redux Toolkit             | `useState` + `useRef` inside the `useX` hooks | See above |
| Forms                | RHF + Zod                                            | Manual `useState` form fields             | Few forms in Resonance; low blast radius |
| Variants             | `cva`                                                | Inline ternaries (`profile === 'X' ? ...`) | Not many variant systems yet; would benefit if you add a UI library |
| Styling              | Tailwind utility classes                             | Tailwind utility classes                  | Match |
| Tests                | Vitest, co-located, real fixtures                    | Hand-runnable scripts                     | Diverges from canon |
| Lint / format        | flat-config ESLint + typescript-eslint + Prettier    | `eslint .` script with no config; no Prettier | Diverges from canon |
| Workspaces docs      | `tsconfig.base.json`, root scripts wrapping `--workspaces --if-present` | `tsconfig.base.json` exists, root scripts use `pnpm -r` | Match in spirit |
| `.gitattributes`     | LF-everywhere baseline                               | No `.gitattributes`                       | Diverges from canon (small fix) |
| Docs structure       | `docs/plans/`, `docs/tickets/`, `docs/superpowers/`  | None — but excellent `ARCHITECTURE.md`    | Different shape, same end (durable design memory). Good as-is. |
| Type-only imports    | Enforced via `consistent-type-imports`               | Used by hand consistently                 | Match in practice — the rule would just enforce what's already there |
| Quote style          | Single quotes (per canonical Prettier config)         | Double quotes everywhere                  | Pure Prettier config decision — flip the switch and reformat |

### How to read this

This is **not** a list of "things you got wrong." Three reasons:

1. **Skills explicitly carve out alt-stacks.** Both
   `reaching-for-frontend-libraries` and `reaching-for-backend-patterns`
   tell future-you to follow what's already in the project rather than
   force the canonical libraries on top. So Express, Drizzle, Clerk, and
   `useX` hooks are all *correctly* the local convention.
2. **Resonance pre-dates much of the canon.** Many of these conventions
   matured in `crew` and `Recipes`; Resonance is the older codebase doing
   the same architectural shape with different library choices.
3. **The interesting comparison is "polish layer," not "stack layer."**
   Stack-layer differences (Express vs. Fastify) are local commitments.
   Polish-layer gaps (no Vitest, no ESLint config, `console.log`, no env
   validation) are where canon and Resonance *should* converge — and
   where the recommendations in §3 do double duty as "match your own
   established conventions."

### Reframed priorities

This is the same priority list, with the canon framing layered in:

- **§3.1 (ESLint + Prettier) and §3.2 (Vitest)** become *much* easier to
  justify: the configs in `crew/eslint.config.js` and `Recipes/eslint.config.ts`
  are essentially copy-paste-ready (with one swap for pnpm + the
  appropriate workspace glob). The Prettier config in
  `~/.claude/conventions/node.md` ships with explicit values
  (`semi: true, singleQuote: true, trailingComma: "all", printWidth: 100,
  tabWidth: 2`). You'd be importing your own canon, not picking new tools.
- **§3.7 (env at boot via Zod)** is *explicitly* called for in
  `reaching-for-backend-patterns` ("Config is validated at boot. A Zod
  schema parses `process.env` once on startup."). Skipping it on
  Resonance puts the codebase out of step with a rule the skill states
  prescriptively.
- **§3.8 (logging)** should specifically swap to **pino** — that's the
  canon's pick, and it gives you JSON-in-prod / pretty-in-dev for free
  with `pino-http` for request IDs.
- **§3.5 (refactor large pages)** maps to a specific convention from
  `node.md`: "Page files should read as composition" with shared
  primitives in `src/components/ui/` and feature-scoped components in
  `src/components/<feature>/`. Resonance partially follows this
  (`components/shared/`, `components/profile/`, etc.) but the page
  components inline far too much.

### What's *not* worth reaching for

Worth naming explicitly so it doesn't loop back as a follow-up:

- **Migrating Express → Fastify.** Resonance committed to Express; the
  skill carve-out covers this. Adopting Fastify would also force a
  rewrite of the SSE plumbing, the Clerk integration, and the route
  layer. High cost, low marginal value over what's there.
- **Migrating Drizzle → Kysely.** Drizzle is well-suited here (JSONB
  with `$type<T>()` type-narrowing, editable migrations). Kysely is a
  fine alternative; not worth the churn.
- **Migrating Clerk → Better Auth.** Clerk's React components +
  Express middleware are already wired up and working. Better Auth is
  more *yours* (self-hosted), but the migration cost dominates.
- **Migrating pnpm → npm workspaces.** Both work; the lockfile churn
  isn't worth it.
- **Adopting TanStack Query.** Resonance's `useX` hooks are a coherent
  custom pattern with optimistic updates, polling, and rollback already
  baked in. The skill explicitly accepts "the team's pattern *is* the
  project's canonical solution." See §6 below for the nuance — adding
  TanStack Query alongside the existing pattern would create two truths.

### What's borderline

These could go either way; flagging for visibility:

- **Adopting `react-error-boundary`.** Resonance's error UX is currently
  inline error states in components (e.g.
  `if (status === "error") return <p>{error}</p>`). Wrapping route
  subtrees in an `<ErrorBoundary>` + a `useErrorBoundary`-aware fetch
  layer would be cleaner. Small, surgical, and the skill is explicit
  that it counts as "additive, not restructuring."
- **Adopting `cva` for variants.** No real variant system exists in
  Resonance yet, so there's nothing to migrate. The day a `Button` /
  `Card` / `Pill` primitive appears, reach for `cva` immediately rather
  than building a class-map by hand. (The MediaCard could be the first
  candidate.)
- **Adopting `sonner` for toasts.** Currently there's nothing — errors
  surface as inline text. If/when you add notifications (e.g. "rec
  feedback saved", "library import succeeded"), `sonner` is the canon's
  pick.

---

## 2. What this repository does well

These are not throwaway compliments. Each is a thing the owner should
continue to invest in and surface in interviews / portfolio writeups.

### 2.1 Documentation that actually justifies decisions

`README.md` and especially `ARCHITECTURE.md` are far above the bar for a
portfolio project. The architecture doc is structured the way a senior
review would walk a new hire through the system: stack → data model → AI
modes → adapters → auth → jobs → frontend → notable design decisions →
known limitations. Critically, **every section names trade-offs**, not just
choices. *"JSONB over normalized themes table because the field gained
`dislikedTitles` mid-project without a DB migration"* is the kind of
sentence that signals real engineering judgment. The "Why not Claude with
Projects?" section in particular is the right level of self-awareness for a
product that is built around Claude.

The "Known limitations / what's not built" section is also the right move —
articulating deferred work shows scope discipline rather than pretending the
project is complete.

### 2.2 Anti-hallucination architecture

The contract that every user-facing recommendation must correspond to a real
`media_cache` row, populated from a verified external API, is the
architectural decision that separates this from a "wrap an LLM" project.
The four-step pipeline (AI proposes → adapters verify → AI scores → persist)
is a clean separation of "what models are good at" from "what infrastructure
is good at." Combined with `canonicalizeTitle` / `matchesKnown` for series
collapse, the de-duplication and dead-title-drop logic is robust enough to
discuss in a system-design interview.

### 2.3 The streaming tag filter

`apps/server/src/services/ai/streaming.ts` is a small piece of code that
solves a real, subtle problem: SSE chunks can split mid-tag (`"<analy"` +
`"sis>secrets"`) and a naive implementation leaks the prefix to the user.
The filter buffers the longest possible partial-tag suffix and only emits
the safe prefix. The 14 hand-runnable test cases cover the boundary
behaviors well. This is exactly the kind of code that benefits from a real
test runner (see §4) — the tests are already written; they just need a
home.

### 2.4 Type safety end-to-end

The `packages/shared` workspace exposes the canonical TypeScript types
(`MediaItem`, `TasteProfile`, `MediaType`, `OnboardingMessage`, etc.) and
both the client and server import them via the workspace alias. Drizzle's
`$inferSelect` / `$inferInsert` types flow from the DB schema. Zod schemas
on `output_config.format` constrain Claude's generation AND validate at
runtime. A backend rename causes a frontend typecheck failure rather than a
silent runtime mismatch. This is the right shape.

### 2.5 Defense-in-depth in auth

Every `userId`-scoped query *also* explicitly filters by `user_id` even
though Clerk middleware + `requireUser` already gate access. This is
correctly described in the architecture doc as "belt and suspenders" — and
it would protect you from a future bug in the auth chain. This is the
right call for an app that handles user-private data; many production apps
get this wrong.

### 2.6 Anthropic SDK usage

Several details signal real familiarity with the SDK:

- **Prompt caching** correctly applied via `cache_control: ephemeral` on
  the last message in onboarding (apps/server/src/services/ai/onboarding.ts:60-66).
- **Structured output** via `zodOutputFormat` for both candidate generation
  and scoring, with the v3/v4 SDK type mismatch handled and documented.
- **Both schema-as-contract and schema-as-validator** — same Zod object is
  passed to the model AND used to `.parse()` the response. This is the
  pattern the Anthropic SDK rewards.
- **Streaming** properly handled with the chunk filter forwarding deltas
  through SSE.
- **Model pinned by name** with a clear comment about Haiku vs. Sonnet
  trade-offs in scoring quality.

### 2.7 Rate limiting at the right layers

Three different rate-limit concerns are handled by three different
mechanisms:

- **Per-user daily AI caps** via `services/rateLimit.ts` (in-memory
  buckets keyed by `userId:kind`).
- **Per-adapter token buckets** via `lib/rateLimiter.ts` (TMDB 40/10s,
  IGDB 4/s, Jikan 1/500ms, Open Library 5/s).
- **Job-level deduplication** so accidental double-clicks don't queue two
  recommendation runs.

This is the right shape for what each layer is protecting.

### 2.8 Optimistic UI with rollback

The frontend hooks consistently apply optimistic updates, capture a snapshot,
and roll back on error. `useRecommendations.setFeedback` and `planTo` are
clean examples. This is the correct pattern; many React codebases either
skip optimism entirely (slow feel) or skip rollback (silently inconsistent
state).

---

## 3. Improvement areas

Ordered by leverage. Each item names the file/area, the problem, and a
recommended fix.

### 3.1 Linting and formatting are advertised but not configured *(quick win)*

`apps/client/package.json` declares `"lint": "eslint ."` but **there is no
ESLint config file anywhere in the repo** (no `eslint.config.js`,
`.eslintrc.*`, or config block in `package.json`). Running `pnpm lint` will
either no-op against an empty default config or fail outright. The server
package doesn't even define a `lint` script.

There is also no Prettier configuration. Formatting will drift between the
owner's editor settings, future contributors, and any AI assistant editing
the code.

**Fix:**

1. Add a flat-config `eslint.config.js` at the repo root (ESLint 9+) using
   `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react`,
   and `eslint-plugin-react-refresh` (Vite's recommended set). Apply
   different presets to client (browser globals, React) vs. server (Node
   globals, no React).
2. Add `prettier` with a minimal `.prettierrc` (the codebase already follows
   a consistent style — capture it: 2-space indent, double quotes, trailing
   commas, semicolons).
3. Add an `eslint-config-prettier` shim so ESLint and Prettier don't fight.
4. Add server-side `lint` and `format` scripts mirroring the client.
5. Add `lint` + `format:check` to CI (see §3.4).

Time investment: 1-2 hours, plus an initial pass to fix any errors the new
config surfaces. The codebase is clean enough that this should be small.

### 3.2 No real test infrastructure *(highest leverage of any single change)*

The three `*.test.ts` files (`streaming.test.ts`, `rateLimiter.test.ts`,
`mediaCache.test.ts`) are **hand-runnable scripts**, not test-runner
specs — they're invoked via `pnpm tsx <path>` and use `console.log` +
`process.exit(1)` for assertion. They are well-conceived test cases (the
streaming filter cases in particular are excellent), but they:

- Don't run in CI.
- Don't run on `pnpm test` (no `test` script exists).
- Make the codebase look tested when it functionally isn't.

**Fix:**

1. Add **Vitest** as the test runner. It integrates seamlessly with Vite
   (no config gymnastics for ESM/TS), is fast, and uses Jest-compatible
   matchers. Add it as a workspace-root dev dependency.
2. Add a root-level `vitest.config.ts` and a `pnpm test` script.
3. Migrate the three existing test files: replace the manual `for (const c
   of cases)` loop in `streaming.test.ts` with `describe.each(cases)` —
   the test cases themselves are kept verbatim. Same for rate limiter
   timing tests.
4. Consider keeping `mediaCache.test.ts` as a *live integration smoke* (it
   hits real APIs) and gate it behind an env check or a separate Vitest
   project so it doesn't run on every CI build.

After Vitest is in place, prioritize coverage for these high-value targets:

| Target                                               | Why                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `canonicalizeTitle` / `matchesKnown` (recommender)   | Core de-dup logic; regex-based, exactly the kind of code that breaks silently |
| `meetsReadinessFloor` / `stripModelTags` (onboarding)| Logic gates user-visible behavior                                  |
| `StreamFilter` (already covered, just port)          | Already great cases; just needs the runner                          |
| `checkRateLimit`                                     | Time-of-day arithmetic is easy to get subtly wrong                  |
| `parseLetterboxdCSV` / `parseGoodreadsCSV` (library) | Parsing user-supplied data; needs property-style and edge-case coverage |
| Adapter normalization (TMDB, IGDB, Jikan, OL)        | Test against fixture JSON, not live APIs                            |

For **API integration tests** consider adding **Supertest** against the
`createApp()` Express factory — it doesn't need a port, just an app
instance. Combined with a test database on Neon (or a Drizzle-backed
SQLite setup, if you want isolation), you can exercise the full request →
DB roundtrip without standing up a server.

For **E2E** the two flows worth covering with **Playwright** are:

1. New user → onboarding chat → "I'm done" → profile generated → first
   recommendation batch.
2. Existing user → evaluate "Would I like X?" → status flags surface
   correctly.

These two flows cover the differentiator loops; below this tier I'd hold
off on E2E until the app is in production.

For **mocking external HTTP**, **MSW (Mock Service Worker)** is the right
tool — intercepts at the `fetch` layer in both Node and the browser, so
the same fixture set covers unit, integration, and E2E.

### 3.3 `CLAUDE.md` has drifted from reality *(quick win, high blast radius)*

The repo-level `CLAUDE.md` is a working spec from earlier in the project,
and it no longer matches what was built. Specific drift:

- Describes a non-monorepo layout (`src/client/`, `src/server/`) — the
  actual layout is `apps/client/`, `apps/server/`, `packages/shared/`.
- Lists **6 tables** in the data model; the actual schema has **9**
  (`recommendation_batches`, `library_items`, `discovery_themes` are
  missing from the doc).
- Doesn't mention features that were shipped: discovery themes / explore,
  evaluate ("Would I like X?"), library imports (Letterboxd, Goodreads),
  Steam, watchlist status, batches as first-class objects.
- The **API routes** section is incomplete relative to the actual surface
  (`/api/library`, `/api/evaluate`, `/api/discover`, `/api/recommendations/batches`,
  `/api/recommendations/active-job`, `/api/recommendations/:id/rescore`,
  etc.).

This matters because `CLAUDE.md` is *the* file Claude Code (and Cursor,
Aider, etc.) reads to orient itself. An out-of-date `CLAUDE.md` will steer
AI-assisted edits toward the wrong file paths and the wrong table names.

**Fix:** treat `CLAUDE.md` as a navigation aid, not a spec — point to
`ARCHITECTURE.md` for the canonical reference and keep `CLAUDE.md`
narrowly focused on conventions ("use Drizzle's query builder, not raw
SQL"; "AI prompts go in `services/ai/prompts/`"; "use Zod for runtime
validation of AI JSON outputs"). Drop the bullet-by-bullet duplication of
the architecture; it's just a maintenance burden.

### 3.4 No CI/CD pipeline

There is no `.github/workflows/` directory. Every check (typecheck, lint,
test, build) is currently a "remember to run it locally" affair. For a
portfolio project this is one of the easiest wins to demonstrate "I know
how to ship software."

**Fix:** add a single `.github/workflows/ci.yml` that runs on PRs and
pushes to main:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck` (already exists, recursive)
3. `pnpm lint` (after §3.1)
4. `pnpm test` (after §3.2)
5. `pnpm build` (already exists, recursive)

Optionally add a separate workflow that runs the live-API integration
tests on a schedule (e.g., daily) so external-adapter regressions are
caught before users hit them.

### 3.5 Large page components mixing data, layout, and business logic

The page-level components have grown well past the threshold where they're
easy to reason about:

| File                                | Lines | Notes                                              |
| ----------------------------------- | ----- | -------------------------------------------------- |
| `pages/HomePage.tsx`                | 620   | Greeting + dashboard + LandingPage in one file     |
| `pages/RecommendationsPage.tsx`     | 610   | Batch list + filters + cards + actions             |
| `pages/EvaluatePage.tsx`            | 444   | Search → pick → score state machine + UI           |
| `pages/ListsPage.tsx`               | 254   |                                                    |
| `pages/ExplorePage.tsx`             | 228   |                                                    |
| `pages/ProfilePage.tsx`             | 200   |                                                    |

The hooks pattern (`useRecommendations`, `useBatches`, `useLibrary`, etc.)
already does the heavy lifting of separating data from UI — the page
components are mostly presentation. The opportunity is to break each
page's render into named subcomponents kept in the same directory.
`HomePage.tsx` is the strongest candidate: split `Dashboard`,
`StarterPrompts`, `ProfileSummary`, `BatchPreview`, `LibraryPreview`
into sibling files. None of these need to be globally reusable
components; they just need to be readable in isolation.

A useful rule of thumb: a single React component file >400 lines is
nearly always doing two or three jobs.

### 3.6 In-memory state for jobs and rate limits

This is acknowledged in the architecture doc as a known limitation. It's
mentioned here because it's the single largest barrier to running this
service horizontally: a multi-instance deployment would have inconsistent
rate-limit counters and broken job polling (the next-poll request might
hit a different replica that doesn't know the job exists).

**Fix when you want to scale:**

- Move the `jobs` Map to a `jobs` table in Postgres (id, user_id, kind,
  status, started_at, completed_at, error, result jsonb). The `setInterval`
  cleanup becomes a periodic delete.
- Move the `rateLimit.ts` buckets either to Redis (Upstash works well on
  Vercel-style infra) or to Postgres if you want to avoid adding a
  dependency. Postgres-based works fine at the volumes implied by the
  current limits.

Both swaps preserve the existing module APIs, so the call sites
(`api/recommendations.ts`, `api/onboarding.ts`, etc.) don't change.

For **medium-term**: I'd argue the job system is the only one of the two
that *needs* this — daily rate-limit counters in memory are tolerable
even at small scale, since the worst case is a user getting "extra" calls
allowed across a deploy. Job-state loss is more disruptive (a
mid-generation reload after a deploy gives the user a 404).

### 3.7 No environment validation at boot

`apps/server/src/env.ts` loads `.env.local` and `.env`, but never validates
that required variables are present. The server boots happily without
`ANTHROPIC_API_KEY` and only fails when an AI call is attempted. Same for
`DATABASE_URL`, `CLERK_SECRET_KEY`, etc.

**Fix:** add a Zod schema for `process.env`, parsed at boot:

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),
  STEAM_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  FRONTEND_ORIGIN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
```

Then have call sites import `env` instead of touching `process.env`
directly. Boot fails loudly with a usable error message instead of silently
later.

### 3.8 Logging is `console.log` everywhere

The rec pipeline emits great diagnostic logs (`[rec] batch created…`,
`[rec] filtered: N disabled format…`), and it's clear the owner uses
them while developing. In production they go to stdout unstructured,
which is fine for a Render free-tier dashboard but doesn't scale.

A few of these logs include user content (titles in the avoid set, prompt
text) — at the current scale this is just diagnostic noise, but it should
not flow to a third-party log aggregator without redaction.

**Fix:**

1. Introduce a tiny logger module wrapping `pino` (fast, structured, JSON
   in prod / pretty in dev). Import it everywhere `console.*` is used.
   `pino` is the canon's choice — `reaching-for-backend-patterns` names
   it explicitly under the decision framework.
2. Add a request-id middleware that generates a UUID per request and
   attaches it to logs in that request's call tree (`pino-http` does this
   automatically).
3. Wire **Sentry** (or equivalent — Highlight, Bugsnag) for unhandled
   errors. The existing `errorHandler` middleware logs and 500s; Sentry
   would also page you and surface the stack trace in a UI.
4. When you log user content, prefix-tag it (`titles=`, `prompt=`) so
   future redaction is easy to write.

This becomes meaningful the moment Resonance has a public URL.

### 3.9 No API documentation

The route handlers have excellent JSDoc comments at the top of each
endpoint, but there's no machine-readable contract. For a portfolio
project this is a "would-be-nice"; for a production app it's an
accelerator (frontend-backend contract testing, public API docs, client
SDK generation).

**Fix:** consider one of:

- **`zod-to-openapi`** — derive OpenAPI from your existing Zod schemas
  with a thin layer of route metadata. Lowest extra weight.
- **Hono** or **Fastify** — these frameworks have first-class OpenAPI
  story baked in. Migrating off Express 4 is more work than the docs
  alone justify.

I'd default to `zod-to-openapi` if you adopt anything; even an
auto-generated **/api/docs** endpoint makes the API surface inspectable.

### 3.10 Smaller things worth fixing

These are not high-leverage individually, but cumulatively they tighten
the codebase.

- `apps/server/src/services/ai/client.ts` — the client is cached as a
  module-level singleton, but if `ANTHROPIC_API_KEY` changes (unlikely in
  prod, common in tests) the cached client wins. Acceptable, but consider
  reading the env at construction once and stop caching, or accept it
  explicitly via DI.
- `apps/server/src/lib/sse.ts` — small enough that it's fine, but worth a
  unit test since chunk encoding is exactly the kind of thing that breaks
  silently.
- `apps/server/src/api/recommendations.ts:221` — the mounted router has
  *both* `recommendationsRouter` and `feedbackRouter` under
  `/api/recommendations`. This works because Express resolves first-match,
  but a developer reading `app.ts` sees two `app.use("/api/recommendations", …)`
  calls and wonders. Either merge them into one router, or mount the
  feedback router under a different path (e.g. `/api/recommendations/:id/feedback`
  is its only route — that could live in the recommendations router).
- `apps/client/src/hooks/useRecommendations.ts:120-160` — the polling loop
  has an `await new Promise(setTimeout(...))` inside a `while`. Works, but
  the cleanup story on unmount is fragile (the in-flight setTimeout still
  resolves, then the cancelledRef check catches it). Consider switching
  to `setInterval` + clearInterval, or AbortController-based cancellation.
- `tsconfig.base.json` is referenced by the workspaces but I'd verify the
  path-alias setup (`@resonance/shared`) resolves both at typecheck time
  *and* at runtime — `tsx` honors `package.json` exports, but a future
  `tsc`-built deploy may not.
- The `console.log` at `apps/server/src/services/ai/recommender.ts:392-395`
  prints "favorites set" + "avoid set" with up to 12 user-supplied titles.
  Fine in dev; route through the structured logger before going prod.

---

## 4. Testing recommendations

A consolidated answer to "what testing frameworks should I add?". Order
matches the priority I'd attack them in.

### 4.1 Vitest (must-have)

- **Why:** native Vite integration, ESM/TS out of the box, Jest-compatible
  API. Fast watch mode. Works for both client and server in this monorepo.
- **Coverage:** see §3.2 for the priority list. Start with the pure
  functions (`canonicalizeTitle`, `matchesKnown`, `parseLetterboxdCSV`,
  `parseGoodreadsCSV`, `meetsReadinessFloor`, `StreamFilter`).
- **Investment:** 1 day to set up + port existing scripts; ~3-5 days to
  reach meaningful coverage of pure logic.

### 4.2 Supertest (recommended for API tests)

- **Why:** test the Express app directly without booting a real server.
  Pairs with Vitest naturally. Combined with a Drizzle-backed test DB or
  testcontainers-postgres, you get the full request → DB roundtrip.
- **Coverage:** the `/api/onboarding/complete` idempotency logic, the
  `/api/recommendations/generate` rate-limit + duplicate-job behavior,
  feedback rollback semantics, library import endpoints.
- **Investment:** 2-3 days to set up the test DB harness + write the first
  10 endpoint tests.

### 4.3 React Testing Library + Vitest (recommended for client)

- **Why:** the canonical pairing for React. Test hooks (`useRecommendations`,
  `useEvaluate`) and component-level interactions in isolation.
- **Coverage:** the optimistic-update + rollback paths in
  `useRecommendations.setFeedback` and `useLibrary.setFeedback` are the
  most regression-prone; cover those first.
- **Investment:** 2-3 days for the harness + a representative test of each
  hook.

### 4.4 Playwright (E2E, optional but valuable)

- **Why:** the only way to catch full-stack contract regressions
  (frontend ↔ backend ↔ DB) and UX regressions (a streaming bug that only
  reproduces in a browser SSE client).
- **Coverage:** the two flows named in §3.2 (onboarding chat → first batch
  // evaluate verdict).
- **Investment:** 3-5 days for the harness + first two flows. Diminishing
  returns after that until the app is live.

### 4.5 MSW — Mock Service Worker (recommended for both)

- **Why:** intercepts at the `fetch` / `XHR` layer, so the same handlers
  serve unit tests, integration tests, and Playwright E2E. Prevents test
  flakiness from real-API rate limits and means CI doesn't burn TMDB /
  Anthropic budget.
- **Coverage:** the four media adapters and the Anthropic SDK calls.
- **Investment:** 1-2 days to capture fixtures for the major candidate-search
  responses.

### 4.6 Things to *not* prioritize

- **Storybook** — useful for design systems; this app's components are
  app-specific enough that the maintenance cost outweighs the benefit.
- **Cypress** — Playwright is the better modern choice; one or the other,
  not both.
- **Codecov / coverage gating** — get the tests in first, worry about
  coverage % later. Hard coverage gates discourage *good* tests.

---

## 5. Feature suggestions

Ordered roughly by ratio of (user-visible value) to (build effort). Not
all of these belong in a portfolio piece — some are explicitly the kind of
thing you'd build at a job and not in a side project. Treat this as a menu.

### 5.1 Already-designed-just-build-it (high ROI)

These are listed as deferred in `ARCHITECTURE.md` and have most of the
infrastructure in place.

- **Profile version rollback UI** — the `profile_versions` table is
  populated; you just need a `/profile/history` view that lists snapshots
  and a "restore to this version" button. Maps to a single new endpoint
  + a small page.
- **MAL XML library import** — Goodreads + Letterboxd already work via
  CSV; MAL needs an XML parser (`fast-xml-parser`) and an upload affordance.
  Mostly mechanical given the existing pattern.
- **Steam library import UI** — `services/steam.ts` already exists. What's
  missing is the UI: a SteamID input on the library page, a sync action,
  and the env-var-set indicator. ~1 day.

### 5.2 Trust + observability for the user

- **"Why didn't this title appear?"** — when the recommender drops a
  candidate (matched avoidance, matched dislikedTitle, format disabled,
  duplicate), surface a debug view per batch listing dropped titles +
  reasons. Pulls from the existing `console.log` lines; just needs a
  capture path. Builds user trust ("I see why it filtered X") and is a
  great interview-bait feature ("here's how I made the AI's decisions
  inspectable").
- **Profile coverage indicator** — a small UI element on the profile
  page showing which formats / themes are weakly represented and offering
  a "talk about this more" prompt. Drives users back into onboarding for
  weak signal areas.
- **Batch confidence/diversity score** — a simple aggregate of the
  matchScores on a batch, plus a count of distinct formats. Helps users
  identify "this batch is a stretch — generate again with a tighter
  prompt."

### 5.3 Cross-format magic (the differentiator, made louder)

- **"Cross-reference map"** — a visualization on the profile page that
  shows how titles in your library cluster (e.g., "you love these for
  fractured-interior themes; these for earned-transformation themes").
  This is the differentiator made graphic. Could be a simple
  force-directed graph; could be as simple as a tag cloud per theme.
- **Similar-batch finder** — "you generated a batch a month ago that was
  similar to this prompt; want to see it?" — leverages your existing
  batch persistence. Cheap to build, surfaces the persistence-as-feature
  story.

### 5.4 Social / portfolio features

- **Public taste profile pages** — "share my taste DNA" — a read-only,
  anonymized version of the profile page accessible at
  `/u/<slug>`. Effectively a mini-portfolio for the user. Could be a
  major engagement driver and is an obvious wedge for "show recruiters
  the project."
- **Batch sharing via signed URLs** — the architecture doc lists this as
  "not in scope," but it's a small feature: add a signed token to a
  read-only batch URL, render the cards on a public page. ~1 day.
- **Compare-two-users mode** — sign-in optional; show what overlap exists
  in two users' taste DNAs ("you both gravitate toward earned-tonal-shift
  works but disagree on pacing"). Real personality and viral-loop
  potential.

### 5.5 Smarter pipeline

- **Embeddings layer** — augment the candidate search with vector search
  over your `media_cache.normalized_data.description`. The AI proposes
  ~15 titles and ~5 genre queries; an embedding step against your cache
  can surface candidates the model didn't think of. Pgvector on Neon
  works for this.
- **Series/franchise awareness via external data** — your dedup is
  string-based via `canonicalizeTitle`. TMDB and IGDB both have
  franchise/collection IDs. Including those in `media_cache.metadata`
  would let you de-dup deterministically rather than via regex.
- **Mood-based one-tap prompts** — a small prompt picker on the home
  page ("anxious", "celebratory", "lonely", "curious") that maps each
  mood to a template prompt. Pure UX; the backend is unchanged.

### 5.6 Ambient features

- **Browser extension** — "Would I like X?" while browsing IMDb /
  Goodreads / Letterboxd / Steam. Reads the title from the page, hits
  your evaluate endpoint, shows a verdict. This is the kind of feature
  that makes the project memorable to a recruiter ("oh, you built a
  Chrome extension that calls your own API").
- **Email digest** — weekly "your profile evolved" / "your saved batch
  has a new candidate" / "we found three new releases that match your
  taste DNA." Adds engagement, but this is the most production-y of all
  the suggestions and probably wrong scope for a portfolio piece.
- **OAuth library imports** — Letterboxd and Goodreads both have APIs;
  replacing the CSV upload with an OAuth flow eliminates user friction.
  Highest UX win, highest implementation cost.

### 5.7 Things I'd *not* prioritize

- **Mobile app.** The web app is responsive enough; a native app is a
  scope explosion.
- **AI-generated cover art.** Tempting but distracts from the "real
  metadata only" architecture.
- **Federated/social recommendations.** Multi-tenant is hard to do right;
  the differentiator is the *individual* taste-DNA story, not the
  social one.

---

## 6. Skills evaluation: `reaching-for-frontend-libraries` & `reaching-for-backend-patterns`

A separate-but-related question: how well do these two skills land in
Resonance specifically, and would small modifications make them more
useful here without weakening their value elsewhere?

### What's already good

Both skills are well-written. They share a structure that earns its
keep:

- **Decision framework table** (a one-line "for problem X, reach for Y"
  matrix). Easy to skim during work; easy to internalize.
- **Common rationalizations table.** This is the load-bearing section.
  The format ("Rationalization | Reality") pre-empts the exact
  arguments a future-Claude or future-you will make to skip the canon —
  "single endpoint, not worth React Query," "lead said no service
  needed," "I'll add it later." Naming the rationalization *and* the
  rebuttal in one row is the right shape.
- **Red flags** as a skim-target list of code patterns that mean stop.
- **Spirit vs. letter / Don't use as a hammer** at the end. The
  carve-outs are correctly scoped: established alt-stacks count, the
  team's pattern is the local canon, prototypes get a pass.

The frontend skill's "the small case is the happy path" framing is
particularly good — it directly defuses the most common reason to skip a
library ("not worth it for one endpoint").

### Where they could land more cleanly in Resonance

Two small gaps surface when reading the skills against this codebase:

#### Gap 1 — The frontend skill's carve-out skews framework-native

The current "Don't use as a hammer" carve-out reads:

> *"Framework or project with an established pattern that overlaps the
> skill's recommendation. If the project committed to a framework's data
> layer (Vike `+data.ts`, Next.js / Remix / Astro loaders, server
> actions), framework-native forms (Remix `<Form>` + actions), or a
> styling system that already handles variants — follow it."*

Every example here is **framework-native** (Vike, Next.js, Remix,
Astro). Resonance's pattern is **custom**: a `useApi()` primitive plus
domain hooks (`useRecommendations`, `useBatches`, `useLibrary`,
`useEvaluate`, `useOnboarding`, `useThemes`, `useProfile`) that own
fetch + state + polling + optimistic updates + rollback. This is a
**coherent, committed convention** and it's the one a contributor
should follow when adding a new domain — but a literal read of the
skill's carve-out leaves room to argue *"it's not Vike, so the carve-out
doesn't apply, so I should reach for TanStack Query."*

That would be the wrong call (it'd create two parallel data layers in
the same codebase). Tightening the carve-out wording would close the
ambiguity.

**Proposed addition** (one bullet under "Don't use as a hammer"):

> *"**Project-internal hook conventions count too.** If a codebase
> consistently uses domain-scoped `useX` hooks that own data fetching,
> caching, polling, and optimistic updates, follow that pattern. Adding
> TanStack Query alongside creates two truths in the same codebase. The
> carve-out covers any *committed* pattern, not just framework-native
> ones — the team's pattern is the project's canonical solution
> regardless of whether the pattern came from a framework or was
> rolled in-house."*

#### Gap 2 — The backend skill is library-prescriptive in the body, alt-stack-permissive only at the end

The body of `reaching-for-backend-patterns` teaches Fastify + Zod +
Kysely + Awilix as a tightly-coupled set. The "Don't use as a hammer"
section *does* carve out alt-stacks (mentions Express + Joi + Sequelize
explicitly), but a future-Claude reading the skill in Resonance might
default to one of two failure modes:

- **"This skill doesn't apply, we're on Express"** — and skip the
  layering pattern entirely.
- **"The skill says use Awilix, let me introduce it"** — even though
  Resonance doesn't have the second-service threshold yet *and* would
  mix conventions if Awilix appeared in some files but not others.

The skill *could* land cleaner with a short "Principles travel further
than libraries" section that explicitly translates the layering pattern
to a non-canonical stack. Concretely:

**Proposed addition** (one new subsection, between "The layering
pattern" and "When to reach for Awilix"):

> ### Principles travel further than libraries
>
> The layering pattern (thin route → service → typed errors → central
> handler) holds in any stack. The libraries are the team default; the
> layering itself is the durable rule.
>
> **Express + Drizzle + Clerk** (a project that pre-dates the canonical
> stack): same layering. Express handler with `Schema.safeParse(req.body)`
> on the way in, business logic in a service module under `services/`,
> custom error subclasses thrown from the service, an Express
> `errorHandler` middleware (registered last via `app.use(errorHandler)`)
> that maps the error class to a status code. Awilix optional — below
> the second-service threshold, importing services as module singletons
> is fine. Above it, plain `awilix` (without `@fastify/awilix`) plugs
> into Express via a `req.scope = container.createScope()` middleware.
>
> **NestJS**: same layering, expressed through Nest's pipes + providers.
>
> **The principle is the layering, not the libraries.** Don't refuse to
> layer because the framework isn't Fastify, and don't paste the
> canonical libraries onto a project that committed to alternatives.

This makes the skill clearly *applicable* to Resonance without watering
down its prescriptions for greenfield work.

### Skills changes I would actually make

If the goal is "make the two skills work better in Resonance without
hurting their value elsewhere," I'd make these two small edits and
nothing else:

1. **`reaching-for-frontend-libraries`**: append the project-internal
   hook conventions bullet under "Don't use as a hammer."
2. **`reaching-for-backend-patterns`**: add the "Principles travel
   further than libraries" subsection between the existing "Layering
   pattern" and "When to reach for Awilix."

I would **not** change:

- The decision framework tables (they're correctly Fastify+Zod+Kysely
  for greenfield).
- The rationalizations tables (they hold up cross-stack — "I'll inline
  validation in the route handler" is a rationalization regardless of
  framework).
- The red flags lists (still red regardless of stack).
- The "Don't use as a hammer" core list — only the additive bullet on
  hook conventions.

Both edits are additive and should leave the skills' authoritative tone
intact for greenfield work. The Resonance-side benefit is that a future
Claude reading the skills *while editing Resonance code* gets less
ambiguity about whether Resonance's idioms are skill-violating or
skill-respecting.

### Where Resonance's `CLAUDE.md` should point at the skills

Independent of the global skills, Resonance's own `CLAUDE.md` could
short-circuit the ambiguity by being direct about what the project's
committed patterns are. Suggested addition (after the existing "Key
conventions" section):

```markdown
## Established patterns (overrides global skills)

- **Frontend data layer:** domain-scoped `useX` hooks own fetch +
  state + polling + optimistic updates. Do not introduce TanStack
  Query, Zustand, or Redux Toolkit alongside them.
- **Backend layering:** thin Express handler → service module →
  typed error → `errorHandler` middleware. Services are imported as
  module singletons (no DI container — Resonance is below the
  second-service threshold per `reaching-for-backend-patterns`).
- **Validation:** Zod everywhere user input crosses a boundary
  (request bodies, AI structured outputs). Same library on the
  frontend if/when forms appear.
- **Logging:** swap to `pino` + `pino-http` when production-bound
  (currently `console.log`).
- **Error vocabulary:** custom error subclasses (`NotFoundError`,
  `ConflictError`, `RateLimitError`) thrown from services; mapped to
  status codes in `middleware/error.ts`. Currently the middleware
  just logs and 500s — extend it as the vocabulary grows.
```

This makes the contract explicit so future-Claude doesn't have to
infer it from the carve-out language in the skills.

---

## 7. Closing

What's striking about this codebase is the consistency of judgment. The
big architectural calls (anti-hallucination via real APIs, structured
profile in JSONB, prompt caching, per-adapter rate limiting, deterministic
readiness floor on top of the model's self-judgment) and the small ones
(WHY-comments instead of WHAT-comments, schemas as both contract and
validator, defense-in-depth in auth) are all pulling in the same
direction: **AI is a component, not the whole system**, and the
engineering around it is what makes the product trustworthy.

The improvements above are mostly about **lowering the cost of changing
the code** in the future — tests, lint, CI, observability, structured
state — rather than about fixing what's there. The current code is
correct; it just doesn't have the safety net you'd want underneath it
when you start moving fast.

If I had to pick one investment to make first, it would be **§3.2 (real
test runner with the existing cases ported)**. The streaming-filter cases
already exist, are well-conceived, and would catch the kind of subtle
regression that's almost impossible to notice in manual QA. Adding Vitest
is a few hours of work that pays for itself the first time it catches a
boundary bug — and the `crew` repo's `vitest.config.ts` is essentially
the starting point.

The second would be **§3.3 (sync `CLAUDE.md`)**. Five-minute fix, big
impact on AI-assisted development going forward — and the right place to
encode the Resonance-specific overrides spelled out in §6.

Across the report, the recurring theme: **most "improvements" here are
really "import your own canon."** Resonance was built before the
conventions in `~/.claude/conventions/` and the patterns refined in
`crew` and `Recipes` matured. The stack-layer choices (Express, Drizzle,
Clerk, custom hooks) are coherent local commitments and the skills'
carve-outs cover them. The polish-layer gaps (lint, format, tests, env
validation, structured logging) are the parts where Resonance just hasn't
caught up to your own established standards — and the configs from your
other repos are nearly drop-in.

— end —
