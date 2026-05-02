import { useRef, useState, type ChangeEvent } from "react";
import {
  useLibrary,
  type ImportSource,
  type LibraryItem,
  type LibraryItemStatus,
} from "../../hooks/useLibrary.ts";
import { Skeleton } from "../shared/Skeleton.tsx";

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

/**
 * "Your library" surface on the profile page. Shows imported / manually-added
 * items, lets the user import a Letterboxd CSV, and surfaces the count by
 * format. Library items feed the recommender as cross-reference targets — so
 * adding more here makes future explanations more grounded.
 */
const SOURCE_LABEL: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  "letterboxd-watchlist": "Letterboxd watchlist",
  goodreads: "Goodreads",
  myanimelist: "MyAnimeList",
};

// Steam isn't an ImportSource (it has its own /import-steam endpoint, not
// /import) but the clear-by-source filter covers all sources stored on
// library_items rows.
const SOURCE_DISPLAY: Record<string, string> = {
  ...SOURCE_LABEL,
  steam: "Steam",
};

export function LibrarySection() {
  const lib = useLibrary();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  // Tracks which source the next file picked from the (single) hidden file
  // input belongs to. Set when the user clicks an "Import X" button, cleared
  // after the import resolves.
  const [pendingSource, setPendingSource] = useState<ImportSource | null>(null);
  const [activeTab, setActiveTab] = useState<LibraryItemStatus>("consumed");
  const [steamInput, setSteamInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSteamSubmit() {
    const value = steamInput.trim();
    if (!value || lib.importing) return;
    const result = await lib.importSteam(value);
    if (result) {
      const dupes =
        result.duplicates > 0
          ? ` · ${result.duplicates} already in library`
          : "";
      setImportMessage(
        `Imported ${result.inserted} of ${result.parsed} Steam games${dupes}.`,
      );
      setSteamInput("");
    } else {
      setImportMessage(null);
    }
  }

  function startImport(source: ImportSource) {
    setPendingSource(source);
    fileInputRef.current?.click();
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file fires onChange
    const source = pendingSource;
    if (!file || !source) {
      setPendingSource(null);
      return;
    }

    try {
      const text = await file.text();
      const result = await lib.importCsv(source, text);
      if (result) {
        const dupes =
          result.duplicates > 0
            ? ` · ${result.duplicates} already in library`
            : "";
        setImportMessage(
          `Imported ${result.inserted} of ${result.parsed} ${SOURCE_LABEL[source]} items${dupes}.`,
        );
      } else {
        setImportMessage(null);
      }
    } finally {
      setPendingSource(null);
    }
  }

  const consumedItems = lib.items.filter((i) => i.status === "consumed");
  const watchlistItems = lib.items.filter((i) => i.status === "watchlist");
  const visibleItems =
    activeTab === "consumed" ? consumedItems : watchlistItems;

  // Per-format counts for the active tab's summary line.
  const counts: Record<string, number> = {};
  for (const i of visibleItems) {
    counts[i.mediaType] = (counts[i.mediaType] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([k, v]) => `${v} ${FORMAT_LABEL[k] ?? k}`)
    .join(" · ");

  return (
    <section id="library" className="space-y-3 scroll-mt-6">
      <div>
        <h2 className="text-lg font-semibold">Your library</h2>
        <p className="text-xs text-neutral-500">
          Works you&apos;ve told us you&apos;ve loved. The recommender
          cross-references these in its explanations, so more items here means
          richer recommendations.
        </p>
      </div>

      {lib.status === "loading" ? (
        <Skeleton className="h-12 w-full rounded-md" />
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            // CSV (Letterboxd, Goodreads) + XML (MyAnimeList). Source is
            // selected by which import button got clicked; this just
            // restricts the file picker to relevant types.
            accept=".csv,text/csv,.xml,text/xml,application/xml"
            onChange={(e) => void handleFile(e)}
            className="hidden"
          />

          {/* Primary action surface — import buttons, side-by-side, so
              users arriving from the home dashboard's "Manage library" link
              immediately see how to import rather than scanning past stats. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ImportButton
              label="Import Letterboxd CSV"
              hint="Movies, watched and rated list"
              busy={lib.importing && pendingSource === "letterboxd"}
              disabled={lib.importing}
              onClick={() => startImport("letterboxd")}
            />
            <ImportButton
              label="Import Letterboxd watchlist"
              hint="Movies you plan to watch (watchlist.csv)"
              busy={lib.importing && pendingSource === "letterboxd-watchlist"}
              disabled={lib.importing}
              onClick={() => startImport("letterboxd-watchlist")}
            />
            <ImportButton
              label="Import Goodreads CSV"
              hint="Books, read and to-read shelves"
              busy={lib.importing && pendingSource === "goodreads"}
              disabled={lib.importing}
              onClick={() => startImport("goodreads")}
            />
            <ImportButton
              label="Import MyAnimeList XML"
              hint="Anime / manga, completed and plan-to lists"
              busy={lib.importing && pendingSource === "myanimelist"}
              disabled={lib.importing}
              onClick={() => startImport("myanimelist")}
            />
          </div>

          {/* Steam — different shape (no file upload, just a text input
              for SteamID/URL). Sits below the file-upload row so the
              visual hierarchy stays "the three CSV/XML imports look the
              same; Steam is its own thing because it's API-driven". */}
          <div className="flex flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-4 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <label
                htmlFor="steam-input"
                className="block text-sm font-medium text-neutral-100"
              >
                Import Steam library
              </label>
              <p className="text-xs text-neutral-500">
                Owned games. No file upload required. Paste your SteamID,
                profile URL, or vanity URL.
              </p>
              <input
                id="steam-input"
                type="text"
                value={steamInput}
                onChange={(e) => setSteamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSteamSubmit();
                  }
                }}
                disabled={lib.importing}
                placeholder="76561198… or steamcommunity.com/id/yourname"
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              onClick={() => void handleSteamSubmit()}
              disabled={!steamInput.trim() || lib.importing}
              className="self-end rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-emerald-700 hover:bg-emerald-950/20 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              {lib.importing && steamInput.trim() ? "Importing…" : "Import"}
            </button>
          </div>

          {/* Tabs — Library (consumed) vs Watchlist (planned). Counts shown
              per tab so the user knows where their stuff is. */}
          <nav className="flex gap-1 border-b border-neutral-800">
            <LibraryTab
              label="Library"
              count={consumedItems.length}
              active={activeTab === "consumed"}
              onClick={() => setActiveTab("consumed")}
            />
            <LibraryTab
              label="Watchlist"
              count={watchlistItems.length}
              active={activeTab === "watchlist"}
              onClick={() => setActiveTab("watchlist")}
            />
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <p className="text-sm text-neutral-300">
              {visibleItems.length === 0
                ? activeTab === "consumed"
                  ? "Nothing in your library yet."
                  : "Nothing on your watchlist yet."
                : `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}${summary ? " · " + summary : ""}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                ["letterboxd", "goodreads", "myanimelist", "steam"] as const
              ).map(
                (source) =>
                  visibleItems.some((i) => i.source === source) && (
                    <button
                      key={`clear-${source}`}
                      onClick={async () => {
                        if (
                          confirm(
                            `Remove all your ${SOURCE_DISPLAY[source]}-imported items? Manually-added entries stay.`,
                          )
                        ) {
                          const n = await lib.clear(source);
                          setImportMessage(
                            `Cleared ${n} ${SOURCE_DISPLAY[source]} items.`,
                          );
                        }
                      }}
                      className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                    >
                      Clear {SOURCE_DISPLAY[source]}
                    </button>
                  ),
              )}
              {lib.items.length > 0 && (
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        `Delete all ${lib.items.length} library items (across both tabs)? This can't be undone.`,
                      )
                    ) {
                      const n = await lib.clear();
                      setImportMessage(`Cleared ${n} items.`);
                    }
                  }}
                  className="rounded-md border border-rose-900 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {importMessage && (
            <p className="text-xs text-emerald-400">{importMessage}</p>
          )}
          {lib.error && (
            <pre className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">
              {lib.error}
            </pre>
          )}

          {visibleItems.length > 0 && (
            <details className="rounded-md border border-neutral-800 bg-neutral-900">
              <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200">
                View all ({visibleItems.length})
              </summary>
              <ul className="max-h-72 divide-y divide-neutral-800 overflow-y-auto">
                {visibleItems.map((it) => (
                  <LibraryRow
                    key={it.id}
                    item={it}
                    onRemove={() => void lib.remove(it.id)}
                    onMarkConsumed={() =>
                      void lib.setItemStatus(it.id, "consumed")
                    }
                  />
                ))}
              </ul>
            </details>
          )}

          <details className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">
              How to import from Letterboxd
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                On Letterboxd:{" "}
                <span className="text-neutral-200">
                  Settings → Data → Export your data
                </span>
                . You&apos;ll get a <code>.zip</code>.
              </li>
              <li>
                Unzip it. Upload <code>ratings.csv</code> for the strongest
                signal: it has your star ratings, so we know which films you
                loved (4-5 stars become library cross-references) and which you
                bounced off (1-2 stars become avoid signal, like skipping a
                rec).
              </li>
              <li>
                Or upload <code>watched.csv</code> if you want every film you
                logged. Without ratings we treat each as &quot;you watched
                it&quot;: useful context, but no positive or negative bias. If
                you watched something and hated it, prefer{" "}
                <code>ratings.csv</code> so we know.
              </li>
            </ol>
          </details>

          <details className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">
              How to import from Steam
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Visit your Steam profile (
                <code>steamcommunity.com/id/yourname</code> or{" "}
                <code>steamcommunity.com/profiles/76561…</code>) and copy the
                URL, or grab your 64-bit Steam ID from the same page.
              </li>
              <li>
                Paste it into the field above and hit Import. We&apos;ll resolve
                the URL to a SteamID and pull your owned games.
              </li>
              <li>
                <span className="text-neutral-200">Privacy</span>: your Steam
                profile and game-details visibility need to be set to Public for
                the API to return your library. Steam →{" "}
                <span className="text-neutral-200">
                  Edit Profile → Privacy Settings → Game details: Public
                </span>
                . You can flip it back after the import.
              </li>
              <li>
                Owned games come in as{" "}
                <span className="text-neutral-200">consumed</span> with no
                rating; playtime is too noisy a signal to derive a real rating
                from. Rate manually in your library if you want a game to anchor
                cross-references in explanations. Wishlist support is deferred
                (Steam&apos;s wishlist API is gated behind user OAuth).
              </li>
            </ol>
          </details>

          <details className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">
              How to import from MyAnimeList
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                On MyAnimeList:{" "}
                <span className="text-neutral-200">
                  Profile → My List → Export
                </span>
                . Pick anime or manga (you can do both, one at a time). MAL
                gives you a <code>.xml.gz</code>; unzip to get a{" "}
                <code>.xml</code>.
              </li>
              <li>
                Upload the .xml here. Anime and manga can be imported from
                separate files, or you can do them in two upload steps. We
                detect the format from the file&apos;s contents.
              </li>
              <li>
                Status mapping:{" "}
                <span className="text-neutral-200">Completed</span> entries go
                into your Library (with score → rating: 9-10⇒5, 8⇒4, 5-7⇒3,
                3-4⇒2, 1-2⇒1, unrated⇒no rating);{" "}
                <span className="text-neutral-200">
                  Plan to Watch / Plan to Read
                </span>{" "}
                go into your Watchlist; Watching / Reading / On-Hold / Dropped
                are skipped (in-progress or ambiguous).
              </li>
            </ol>
          </details>

          <details className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">
              How to import from Goodreads
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                On Goodreads:{" "}
                <span className="text-neutral-200">
                  My Books → Import and export → Export Library
                </span>
                . Wait for the file to generate, then download the{" "}
                <code>goodreads_library_export.csv</code>.
              </li>
              <li>
                Upload it here. Books on your{" "}
                <span className="text-neutral-200">read</span> shelf go into
                your Library (rated entries become cross-references in
                explanations); books on your{" "}
                <span className="text-neutral-200">to-read</span> shelf go into
                your Watchlist (won&apos;t be re-recommended). Currently-reading
                and custom shelves are skipped.
              </li>
              <li>
                Your star ratings come along: 4-5 stars become library
                cross-references, 1-2 stars become avoid signal, unrated
                (Goodreads &ldquo;0&rdquo;) stays neutral. If you finished a
                book and didn&apos;t like it, give it a star or two on Goodreads
                first; that&apos;s the only way we know.
              </li>
            </ol>
          </details>
        </>
      )}
    </section>
  );
}

function ImportButton({
  label,
  hint,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-start gap-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-left transition-colors hover:border-emerald-700 hover:bg-emerald-950/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900"
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 group-hover:border-emerald-700 group-hover:text-emerald-300"
      >
        ↑
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-neutral-100">
          {busy ? "Importing…" : label}
        </span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </button>
  );
}

function LibraryTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-white text-white"
          : "border-transparent text-neutral-400 hover:text-neutral-200")
      }
    >
      {label}
      <span className="ml-1.5 text-xs text-neutral-500">{count}</span>
    </button>
  );
}

function LibraryRow({
  item,
  onRemove,
  onMarkConsumed,
}: {
  item: LibraryItem;
  onRemove: () => void;
  onMarkConsumed: () => void;
}) {
  const isWatchlist = item.status === "watchlist";
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm leading-snug">
          {item.title}
          {item.year ? (
            <span className="ml-1 text-neutral-500">({item.year})</span>
          ) : null}
        </p>
        <p className="text-xs text-neutral-500">
          {FORMAT_LABEL[item.mediaType] ?? item.mediaType}
          {item.rating != null ? ` · ${item.rating}/5` : ""} · {item.source}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isWatchlist && (
          <button
            onClick={onMarkConsumed}
            className="rounded-md border border-emerald-800/70 px-2 py-1 text-xs font-medium text-emerald-300 hover:border-emerald-600 hover:bg-emerald-950/30"
            title="I've watched / read / played this. Moves to Library."
          >
            Mark consumed
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-xs text-neutral-500 hover:text-rose-400"
          title="Remove"
        >
          ×
        </button>
      </div>
    </li>
  );
}
