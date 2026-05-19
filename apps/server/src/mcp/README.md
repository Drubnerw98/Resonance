# Resonance MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server exposing
Resonance's recommendation pipeline as a tool callable by Claude Desktop,
Cursor, Goose, or any MCP-aware agent client. The agent recommends against
the authenticated user's real taste profile rather than starting from
scratch each session.

The protocol surface lives in this directory; the recommendation logic stays
in `services/ai/recommender.ts`. The MCP layer is a transport on top of the
same anti-hallucination guarantee, format-enable enforcement, library
cross-references, and dedup as the web flow.

## Endpoint

`POST https://<your-resonance-backend>/mcp`

Streamable HTTP transport, stateless mode. Each MCP request creates a fresh
transport + server instance; no per-session memory is held server-side
(state lives in Postgres).

In local development against `pnpm dev`, the endpoint is `http://localhost:3001/mcp`.

## Authentication

Per-user Bearer tokens minted from the web UI (`/settings`). Header shape:

```
Authorization: Bearer rsn_mcp_<43 random base64url chars>
```

Why per-user PATs and not OAuth: see [ARCHITECTURE.md §10](../../../../ARCHITECTURE.md#10-notable-design-decisions) for the trade-off (~2 weeks of OAuth plumbing for negligible portfolio value at the current single-user scale; PAT matches how every developer-facing integration works).

Tokens are stored as SHA-256 hashes; the raw value is shown exactly once at mint time. To revoke, hit the trash icon on the Settings page — the row's `revoked_at` is set and the next verify fails closed.

## Available tools

### `recommend_media`

Generates cross-format recommendations (movies, TV, anime, manga, games, books) grounded in the authenticated user's profile and library. Takes 30–90 seconds; emits four `notifications/progress` events as the pipeline progresses.

**Input:**

```json
{ "prompt": "a movie that'll make me cry" }
```

`prompt` is optional. Omit for a broad mood-agnostic batch.

**Output:** `CallToolResult` with both a text summary (for the agent to render conversationally) and `structuredContent` carrying:

```ts
{
  batchId: string;
  batchUrl: string;              // deep link to /batches/<id>
  runtimeSeconds: number;
  recommendations: Array<{
    title: string;
    mediaType: "movie" | "tv" | "anime" | "manga" | "game" | "book";
    year: number | null;
    matchScore: number;          // 0–100
    explanation: string;
    tasteTags: string[];
    crossReferences: { title: string; reason: string }[];
    externalUrl: string | null;
  }>;
  droppedSummary: { count: number; byReason: Record<string, number> };
}
```

Posters and full synopses are intentionally trimmed — agents don't render images and full descriptions burn context. Use `batchUrl` to send the user to the full visual rendering in the Resonance web app.

**Errors:** Returned as `{ isError: true, content: [{ type: "text", text: "..." }] }` rather than HTTP status codes, so the agent can route the message conversationally. Three named failure modes:

- **No profile** → friendly link to `/onboarding/fast`
- **Zero candidates** (422) → suggestion to widen the prompt
- **Rate limit** → daily cap message (resets midnight UTC)

The rate-limit bucket is shared with the web flow's `recommendations.generate` (25/day). Switching transports doesn't double a user's budget.

### `get_taste_profile`

Read-only access to the authenticated user's persistent `TasteProfile` — themes, archetypes, format affinities, avoidances, disliked titles — plus its version number, last-updated timestamp, and how many recommendations they've acted on. No model call, no rate-limit budget.

Useful as a grounding step before calling `recommend_media` when the user references their taste obliquely ("you know what I like"), or for answering meta questions ("what does the system think I like?").

**Input:** none.

**Output:** `structuredContent` carries `{ version, updatedAt, actedRecCount, profile, profileUrl }`. The `profile` field is the full `TasteProfile` JSONB — see `packages/shared/src/profile.ts` for the type definition.

### `list_recent_batches`

List the user's recent recommendation batches (newest first) so the agent can reason about "have I tried this angle before" without spending an AI call. No model call.

**Input:**

```json
{ "limit": 5 }
```

`limit` is optional, default 5, max 20.

**Output:** `structuredContent` carries `{ batches: BatchSummary[] }` where each summary is:

```ts
{
  id: string;
  name: string | null;       // user-set name, or null for unnamed
  prompt: string | null;     // original prompt
  createdAt: string;         // ISO
  count: number;
  formatCounts: Record<string, number>;
  topTags: string[];         // 3 most-common taste tags
  batchUrl: string;          // deep link to /batches/<id>
}
```

### `evaluate_title`

Give an honest verdict on a specific named work against the user's taste profile and library. **The model is allowed to say no** — this is the differentiator from `recommend_media`, which biases toward inclusion. The verdict prompt explicitly addresses prior negative signal (dislikedTitles, rejected recs) rather than hiding it.

**Input:**

```json
{ "title": "The Bear", "mediaType": "tv" }
```

`mediaType` is required for disambiguation. Top external-API hit is used; ambiguous titles may resolve to the wrong work — be specific.

**Output:** `structuredContent` carries:

```ts
{
  matched: { title, mediaType, year, externalUrl };
  matchScore: number;        // 0–100 (normalized from the 0–1 verdict score)
  verdict: string;
  tasteTags: string[];
  status: {
    inLibrary: boolean;
    inSavedRecs: boolean;
    rejectedBefore: boolean;
    inDislikedTitles: boolean;
    previouslyRecommended: boolean;
  };
}
```

**Errors:** `isError: true` for no profile (with onboarding URL), no search hits, or rate-limit. One Anthropic call per invocation; shares the existing `evaluate.score` rate-limit bucket (100/day).

## Client configuration

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "resonance": {
      "url": "https://<your-resonance-backend>/mcp",
      "headers": {
        "Authorization": "Bearer rsn_mcp_..."
      }
    }
  }
}
```

Restart Claude Desktop. The `recommend_media` tool surfaces under the "Tools" indicator.

### Cursor

`~/.cursor/mcp.json` or workspace `.cursor/mcp.json`. Same shape as Claude Desktop.

### mcp-inspector (smoke test)

Pin the inspector to your local dev server while iterating on the tool:

```sh
pnpm dev:server               # start the backend on :3001
npx @modelcontextprotocol/inspector
```

In the inspector UI:

1. **Transport:** Streamable HTTP
2. **URL:** `http://localhost:3001/mcp`
3. **Auth:** Bearer, paste a token minted from `http://localhost:5173/settings`
4. **Tools tab → `recommend_media`** → invoke with a sample prompt.

Inspector renders progress notifications inline, so a 60s call surfaces as visible motion rather than a hung request.

## Known limitations

- **Render free-tier cold start.** First request after 15 min idle takes ~30s. Acceptable for testing; surface a warning to your users if you're demoing.
- **In-memory rate-limit counters** are single-instance only — same constraint as the rest of the backend (`services/rateLimit.ts`). Going multi-replica would require Postgres-backing the counters first.
- **No OAuth.** PAT is the only auth path for now. See trade-off discussion above.
- **Evaluation harness not yet built.** `apps/eval/` is the next chunk — see [IMPROVEMENT_PLAN.md §2](../../../../IMPROVEMENT_PLAN.md). Until then, quality regressions surface only through manual testing.
