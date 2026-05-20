# Improvement plan

## Shipped

### 1. MCP server ✅

An MCP server exposing the recommendation pipeline to agentic clients (Claude
Desktop, Cursor, Goose, Claude Code). Lives in `apps/server/src/mcp/` —
mounted on the existing Express service at `POST /mcp` rather than a separate
deploy. Four tools: `recommend_media`, `get_taste_profile`,
`evaluate_title`, `list_recent_batches`. Per-user Bearer-token auth
(`mcp_tokens` table, minted from `/profile`). The recommendation logic stayed
in `services/ai/recommender.ts`; the MCP layer owns only the protocol
surface. Anti-hallucination, format enforcement, dedup, rate limits all
carry over unchanged. See `apps/server/src/mcp/README.md`.

### 2. Evaluation harness ✅

`apps/eval` — a three-layer measurement harness so quality changes are
measurable rather than vibes-based:

- **Invariants** — deterministic structural checks (every rec is a real
  `media_cache` row, canonical mediaType, no within-batch dupes, every
  cross-reference anchored). No AI cost.
- **Held-out recall@K** — hides a library title, runs the pipeline, checks
  whether the system re-surfaces it blind.
- **LLM-judge** — Opus 4.7 scores each rec's explanation against a rubric.

First runs surfaced three real findings (cross-ref fabrication, candidate-plan
`max_tokens` truncation, a numeral dedup gap) — see `docs/followups.md`. The
`max_tokens` issue is fixed; the other two are tracked.

## Next

### 3. Published tool definition

Package the MCP server as an installable artifact (npm package or documented
hosted endpoint) so other agentic clients can integrate without reading the
source. Intentionally deferred until the MCP distribution ecosystem settles
— right now "here's the URL and a token" is lower-friction than a package.

### Tracked follow-ups

See `docs/followups.md` for the running queue. The two eval-surfaced
recommendation-quality bugs (sequel-aware cross-reference fabrication,
Roman/Arabic numeral dedup) are slated for a fix pass.
