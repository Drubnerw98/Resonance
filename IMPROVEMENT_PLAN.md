# Improvement plan

The next chunk of work on Resonance, in order.

## 1. MCP server

A new `apps/mcp/` package in this monorepo exposing the recommendation pipeline as a tool callable by Claude, Cursor, or any MCP-aware client. The agent passes a user's taste profile (or a profile ID, reusing existing auth); the server runs the same 4-step recommendation pipeline the web app uses and returns verified, cross-referenced recommendations.

Constraints:

- Reuse the existing services (`recommender`, `mediaCache`, `collectRealCandidates`) rather than reimplementing the pipeline behind a new transport. The MCP package owns the protocol surface; the recommendation logic stays where it is.
- Anti-hallucination guarantee carries over — every returned title corresponds to a real `media_cache` row, same as the web flow.
- Rate limits checked before the expensive call, same shape as the API routes.

## 2. Evaluation harness

A small benchmark in `apps/eval/` that runs the recommendation pipeline against a held-out set of real profiles + ground-truth titles, scoring against metrics that matter: hit-rate on cross-references, format coverage, dedup correctness, hallucination rate (should always be zero given the `media_cache` rule, but worth measuring).

Output is a markdown report committed alongside the run, so improvements are measurable rather than vibes-based. Run on demand initially; consider a CI job later if drift becomes a concern.

## 3. Published tool definition

Package the MCP server as an installable artifact (npm package or hosted endpoint, depending on how the MCP ecosystem shakes out). Document the tool schema, the auth model, and the expected input/output shape so other agentic clients can integrate without reading the source.
