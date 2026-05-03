# Resonance — surface-level code audit

A pass through the codebase looking for things a senior engineer reviewing this for a junior-to-mid full-stack hire would flag. Severity-ordered, not prescriptive — the owner decides which to fix and which to ship as documented limitations.

## High

### 1. IDOR on batch PATCH / DELETE routes

`apps/server/src/api/recommendations.ts:236-265` (PATCH) and `:272-290` (DELETE).

Both mutations run with only `id` in the WHERE clause, then check `row.userId !== req.user!.id` on the returned row. For DELETE the row is already deleted by then; for PATCH already updated. UUID v4 entropy makes exploitation impractical, but the authorization check belongs in the WHERE clause, not after the fact. Pattern across the codebase otherwise filters by `userId` correctly (see `applyFeedback`, `rescoreRecommendation`); these two are the outliers.

Fix shape: `where(and(eq(batches.id, id), eq(batches.userId, req.user!.id)))`. Then `if (!row) return 404`.

## Medium

### 2. Error handler echoes `err.message` verbatim to clients

`apps/server/src/middleware/error.ts:11`. Internal errors (DB constraint messages, Anthropic API errors with embedded prompt fragments, drizzle stack traces) become the JSON body of a 500. Subtle information leak. Status-coded errors are deliberate user-state messages and should pass through; unknown errors should return a generic `"Internal server error"` while the structured log entry stays detailed.

### 3. `generateRecommendations` throws unstructured Error on "0 candidates"

`apps/server/src/services/ai/recommender.ts:421`. No `.status` attached so the global handler returns 500 from what is genuinely a user-state condition ("we couldn't find anything that fit your prompt + filters"). Should be 422 with a friendlier message so the client can show "try widening your prompt" instead of a generic failure.

### 4. `recommender.ts` owns five concerns at 933 lines

Title canonicalization, library/avoid set assembly, candidate plan prompt, scoring prompt, persistence — all in one file. The CLAUDE.md watch list already flags it. Splitting `canonicalizeTitle` + `matchesKnown` + `looseShape` into `services/ai/titleMatching.ts` would unlock direct unit tests on the dedup logic (which is the most subtle / regression-prone code in the pipeline) and shrink the orchestration file by ~150 lines.

### 5. No timeout on Anthropic / external API calls

`client.messages.parse(...)` calls in `recommender.ts`, `extraction.ts`, `evaluate.ts`, `discover.ts`, `decide.ts`, `libraryAnnotation.ts`, `refinement.ts` have no `signal`. If the API hangs, the recommendation job's heartbeat eventually marks it stale at 5 minutes. Five minutes is a long staring-at-spinner experience. `signal: AbortSignal.timeout(90_000)` per AI call surfaces failures faster and lets the job fail cleanly with a typed message.

## Low

### 6. Active-job dedup race

`apps/server/src/api/recommendations.ts:62`. `findActiveJobForUser` then `startJob` is two non-atomic round-trips. Two simultaneous POSTs from the same user can both pass the check and both insert. A partial unique index `(user_id, kind) WHERE status = 'running'` would close it. For a single-user portfolio project the race is theoretical, but worth a one-line note.

### 7. Optional `req.user` typing forces non-null assertions everywhere

Every route handler writes `req.user!.id`. The `requireUser` middleware proves the property is set, but the type augmentation in `middleware/auth.ts` leaves it `User | undefined`. A typed handler factory or a discriminated `AuthenticatedRequest` interface would remove ~30 `!` assertions.

### 8. Per-user rate limit is in-memory and silent on multi-instance

`services/rateLimit.ts`. Already documented as single-instance only. Worth flagging because it doesn't fail loud — the moment a second Render replica spins up, each user effectively gets `N × cap` (counters split across instances). Either move to Postgres or add a boot-time guard that throws if `process.env.WEB_CONCURRENCY > 1`.

### 9. Module-load `setInterval` fires during tests

`services/rateLimit.ts:87` and `services/jobs.ts:242` register hourly cleanup intervals at module load. Both `.unref()` so they don't keep the process alive, but importing these modules from a test currently means a real-DB query fires from a timer. Lazy-start the interval on first `checkRateLimit` / `startJob` call — it's a small change and removes a class of timer-leak warnings under vitest.

### 10. zod v3 + zod v4 SDK cast

`services/ai/schemas.ts`. The `as unknown as Parameters<typeof zodOutputFormat>[0]` casts are well-documented in-file and exist because the Anthropic SDK's type definitions import zod v3 while its runtime imports v4. A senior reviewer would notice and ask; the comment answers them. Mentioning here so it's not surprising. Goes away when the SDK fixes its type imports.

---

**Summary:** the codebase is solid and the issues are concentrated in two places: the recommendation router (auth pattern + error semantics) and the recommender service file (size + timeout discipline). The high-severity item (IDOR) is a one-line fix in two routes. Everything else is judgment-call territory.
