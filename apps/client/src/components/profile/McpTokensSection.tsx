import { useState } from "react";
import { useMcpTokens, type McpToken } from "../../hooks/useMcpTokens.ts";

/**
 * Resolve the MCP endpoint URL from the same env var the app uses for
 * /api/* calls. In dev VITE_API_BASE_URL is unset (Vite proxies relative
 * /api to localhost:3001) — fall back to localhost:3001/mcp so the snippet
 * is usable as-is. In prod it's a full URL ending in /api; swap for /mcp.
 */
function mcpEndpointUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return apiBase && apiBase.startsWith("http")
    ? apiBase.replace(/\/api\/?$/, "") + "/mcp"
    : "http://localhost:3001/mcp";
}

/**
 * Management surface for MCP API tokens — the Bearer credentials that
 * Claude Desktop, Cursor, and other MCP-aware agents use to call into the
 * authenticated user's Resonance account.
 *
 * Each token is shown to the user EXACTLY ONCE on mint. After dismissal,
 * the server only holds a hash and the raw value is unrecoverable; revoke
 * and re-mint is the only path forward.
 */
export function McpTokensSection() {
  const { status, tokens, error, mint, revoke } = useMcpTokens();
  const [name, setName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [justMinted, setJustMinted] = useState<{
    name: string;
    rawToken: string;
  } | null>(null);

  const liveTokens = tokens.filter((t) => t.revokedAt === null);
  const revokedTokens = tokens.filter((t) => t.revokedAt !== null);

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setMinting(true);
    setMintError(null);
    try {
      const { rawToken } = await mint(name.trim());
      setJustMinted({ name: name.trim(), rawToken });
      setName("");
    } catch (err) {
      setMintError(err instanceof Error ? err.message : "Failed to mint token");
    } finally {
      setMinting(false);
    }
  }

  return (
    <section
      id="mcp-tokens"
      className="scroll-mt-24 space-y-3 border-t border-neutral-800 pt-6"
    >
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-neutral-200">
          MCP access tokens
        </h2>
        <p className="text-xs text-neutral-500">
          Connect Claude Desktop, Cursor, or any{" "}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline"
          >
            MCP-aware agent
          </a>{" "}
          to recommend against your real taste profile. Generate a token below
          and paste it into your client's MCP config.
        </p>
      </header>

      <HowToConnect />

      <form
        onSubmit={(e) => void handleMint(e)}
        className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950/40 p-3"
      >
        <label htmlFor="mcp-token-name" className="sr-only">
          Token name
        </label>
        <input
          id="mcp-token-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Token name (e.g. "Claude Desktop on laptop")'
          maxLength={80}
          className="flex-1 rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-700 focus:outline-none"
          disabled={minting}
        />
        <button
          type="submit"
          disabled={minting || !name.trim()}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {minting ? "Generating…" : "Generate token"}
        </button>
      </form>

      {mintError && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {mintError}
        </pre>
      )}

      {justMinted && (
        <JustMintedReveal
          name={justMinted.name}
          rawToken={justMinted.rawToken}
          onDismiss={() => setJustMinted(null)}
        />
      )}

      {status === "loading" && (
        <p className="text-xs text-neutral-600">Loading tokens…</p>
      )}
      {status === "error" && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </pre>
      )}

      {status === "ready" && liveTokens.length === 0 && !justMinted && (
        <p className="text-xs text-neutral-600">
          No active tokens. Generate one above to start using Resonance via
          MCP.
        </p>
      )}

      {liveTokens.length > 0 && (
        <ul className="divide-y divide-neutral-900 rounded-md border border-neutral-800">
          {liveTokens.map((t) => (
            <TokenRow key={t.id} token={t} onRevoke={() => void revoke(t.id)} />
          ))}
        </ul>
      )}

      {revokedTokens.length > 0 && (
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer select-none hover:text-neutral-400">
            Revoked tokens ({revokedTokens.length})
          </summary>
          <ul className="mt-2 divide-y divide-neutral-900 rounded-md border border-neutral-900">
            {revokedTokens.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={null} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Collapsed-by-default reference for wiring a minted token into the three
 * common MCP clients. Kept terse on purpose — the per-token panel already
 * generates the ready-to-paste snippet; this just answers "where does it go."
 */
function HowToConnect() {
  const url = mcpEndpointUrl();
  const code = "rounded bg-neutral-900 px-1 font-mono text-[11px]";
  return (
    <details className="rounded-md border border-neutral-800 bg-neutral-950/40 text-xs text-neutral-400">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-neutral-300 hover:text-neutral-100">
        How to connect a client
      </summary>
      <div className="space-y-3 border-t border-neutral-900 px-3 py-3 leading-relaxed">
        <p>
          Generate a token below — the panel that appears includes a
          ready-to-paste config snippet. Then wire it into your client:
        </p>
        <div>
          <p className="font-medium text-neutral-300">Claude Desktop</p>
          <p>
            Paste the snippet into{" "}
            <code className={code}>claude_desktop_config.json</code> —{" "}
            <code className={code}>%APPDATA%\Claude\</code> on Windows,{" "}
            <code className={code}>~/Library/Application Support/Claude/</code>{" "}
            on macOS — then fully quit and reopen the app.
          </p>
        </div>
        <div>
          <p className="font-medium text-neutral-300">Cursor</p>
          <p>
            Same snippet, into <code className={code}>~/.cursor/mcp.json</code>{" "}
            (or a workspace <code className={code}>.cursor/mcp.json</code>),
            then restart Cursor.
          </p>
        </div>
        <div>
          <p className="font-medium text-neutral-300">Claude Code</p>
          <p>One command — substitute your token:</p>
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[11px] text-neutral-300">
            {`claude mcp add --scope user --transport http \\\n  resonance ${url} \\\n  --header "Authorization: Bearer <your-token>"`}
          </pre>
          <p className="mt-1">
            <code className={code}>--scope user</code> makes it available in
            every project; start a fresh session to pick it up.
          </p>
        </div>
      </div>
    </details>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: McpToken;
  onRevoke: (() => void) | null;
}) {
  const created = new Date(token.createdAt).toLocaleDateString();
  const lastUsed = token.lastUsedAt
    ? new Date(token.lastUsedAt).toLocaleDateString()
    : "never";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
      <div className="flex flex-col">
        <span
          className={
            token.revokedAt
              ? "text-neutral-600 line-through"
              : "font-medium text-neutral-200"
          }
        >
          {token.name}
        </span>
        <span className="font-mono text-[11px] text-neutral-500">
          {token.tokenPrefix}…
        </span>
      </div>
      <div className="flex items-center gap-3 text-neutral-500">
        <span title="Last used">last used: {lastUsed}</span>
        <span title="Created">created: {created}</span>
        {onRevoke && (
          <button
            type="button"
            onClick={onRevoke}
            className="rounded border border-rose-900 px-2 py-0.5 text-rose-300 hover:bg-rose-950/40"
          >
            Revoke
          </button>
        )}
      </div>
    </li>
  );
}

function JustMintedReveal({
  name,
  rawToken,
  onDismiss,
}: {
  name: string;
  rawToken: string;
  onDismiss: () => void;
}) {
  const [copiedTarget, setCopiedTarget] = useState<"token" | "config" | null>(
    null,
  );

  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        resonance: {
          url: mcpEndpointUrl(),
          headers: { Authorization: `Bearer ${rawToken}` },
        },
      },
    },
    null,
    2,
  );

  async function copy(value: string, target: "token" | "config") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 1500);
    } catch {
      // clipboard may be unavailable (iframe, insecure context, etc.) —
      // fall back silently; the user can still select-all the text.
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-100">
      <p className="font-medium">
        "{name}" generated — copy it now. You won't see the full token again.
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-amber-200/70">
          <span>Token</span>
          <button
            type="button"
            onClick={() => void copy(rawToken, "token")}
            className="rounded border border-amber-700/50 px-2 py-0.5 text-amber-200 hover:bg-amber-900/40"
          >
            {copiedTarget === "token" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[11px] text-emerald-300">
          {rawToken}
        </pre>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-amber-200/70">
          <span>Claude Desktop / Cursor config</span>
          <button
            type="button"
            onClick={() => void copy(configSnippet, "config")}
            className="rounded border border-amber-700/50 px-2 py-0.5 text-amber-200 hover:bg-amber-900/40"
          >
            {copiedTarget === "config" ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[11px] text-neutral-300">
          {configSnippet}
        </pre>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-amber-700/60 px-3 py-1 text-amber-200 hover:bg-amber-900/40"
        >
          I've saved it
        </button>
      </div>
    </div>
  );
}
