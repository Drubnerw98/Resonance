import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import { useLibrary, type LibraryItem } from "../hooks/useLibrary.ts";
import {
  useWatchlistDecide,
  type WatchlistPick,
} from "../hooks/useWatchlistDecide.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { LoadingPulse } from "../components/shared/LoadingPulse.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

const FORMAT_DOT_COLOR: Record<MediaType, string> = {
  movie: "bg-rose-500",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-500",
  manga: "bg-violet-500",
  game: "bg-emerald-500",
  book: "bg-sky-500",
};

const STARTER_MOODS = [
  "Something cathartic, I want to feel something",
  "Light, no thinking, make me laugh",
  "A long slow burn for the weekend",
  "Short and propulsive, I have an evening",
  "Something I'll be thinking about all week",
];

const FORMAT_ORDER: MediaType[] = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
];

export function WatchlistPage() {
  const profile = useProfile();
  const lib = useLibrary();
  const decide = useWatchlistDecide();
  const [draft, setDraft] = useState("");

  const watchlist = useMemo(
    () => lib.items.filter((i) => i.status === "watchlist"),
    [lib.items],
  );

  if (profile.state.status === "missing") {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Watchlist"
          subtitle="Stuff you plan to consume, with an AI second opinion on what fits your mood."
        />
        <EmptyState
          title="No profile yet"
          description="Mood-based ranking uses your taste DNA. Finish onboarding first; once you have a profile, this page can sort your watchlist by mood."
          action={
            <Link
              to="/onboarding"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Start onboarding
            </Link>
          }
        />
      </section>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void decide.decide(draft);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Watchlist"
        subtitle={
          watchlist.length === 0
            ? "Stuff you plan to consume, with an AI second opinion on what fits your mood."
            : `${watchlist.length} item${watchlist.length === 1 ? "" : "s"} on deck across ${countFormats(watchlist)} formats.`
        }
      />

      {/* Mood prompt — the differentiator. Always visible above the list so
          the page leads with the action. */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-neutral-100">
            What fits your mood tonight?
          </h2>
          <p className="text-xs text-neutral-500">
            Describe a feeling or shape, and I&apos;ll rank your watchlist for it.
          </p>
        </header>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={decide.status === "loading" || watchlist.length === 0}
              placeholder="e.g. something cathartic but short"
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                !draft.trim() ||
                decide.status === "loading" ||
                watchlist.length === 0
              }
              className="rounded-md bg-white px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {decide.status === "loading" ? "Deciding…" : "Decide"}
            </button>
          </div>

          {watchlist.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Try
              </span>
              {STARTER_MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft(m)}
                  disabled={decide.status === "loading"}
                  className="rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-emerald-700 hover:bg-emerald-950/30 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </form>
      </section>

      {decide.error && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {decide.error}
        </pre>
      )}

      {decide.status === "loading" && (
        <LoadingPulse message="Reading your watchlist against your taste DNA. Usually 5-15 seconds." />
      )}

      {decide.status === "ready" && decide.picks.length > 0 && (
        <section className="space-y-3">
          <header className="flex items-baseline justify-between gap-3 border-b border-neutral-800 pb-2">
            <h2 className="line-clamp-2 text-base font-semibold leading-snug">
              For &ldquo;{decide.prompt}&rdquo;
            </h2>
            <button
              onClick={decide.reset}
              className="shrink-0 text-xs text-neutral-400 hover:text-neutral-200"
            >
              clear
            </button>
          </header>
          <ul className="space-y-3">
            {decide.picks.map((p) => (
              <li key={p.libraryItemId}>
                <PickRow pick={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {decide.status === "ready" && decide.picks.length === 0 && (
        <EmptyState
          title="No strong fits"
          description="Nothing on your watchlist felt like a good match for that mood. Try a different angle, or refine your watchlist."
        />
      )}

      {/* Full watchlist below — grouped by format. Always shown so the page
          works as a watchlist viewer even without running a decide call. */}
      {lib.status === "loading" ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <EmptyState
          title="No watchlist items yet"
          description={
            <>
              Mark a recommendation as <em>Plan to</em>, or import a watchlist:
              Goodreads <em>to-read</em> shelf, MyAnimeList{" "}
              <em>plan-to-watch</em>, or add manually from{" "}
              <Link to="/profile#library" className="underline">
                your library
              </Link>
              .
            </>
          }
        />
      ) : (
        <WatchlistByFormat items={watchlist} />
      )}
    </section>
  );
}

function PickRow({ pick }: { pick: WatchlistPick }) {
  return (
    <article className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
      <span
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-800/70 bg-emerald-950/40 text-xs font-semibold text-emerald-300"
        aria-label={`Rank ${pick.rank}`}
      >
        {pick.rank}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-semibold leading-snug text-neutral-100">
            {pick.title}
          </h3>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${FORMAT_DOT_COLOR[pick.mediaType]}`}
            />
            {FORMAT_LABEL[pick.mediaType]}
            {pick.year != null && ` · ${pick.year}`}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-neutral-300">
          {pick.explanation}
        </p>
      </div>
    </article>
  );
}

function WatchlistByFormat({ items }: { items: LibraryItem[] }) {
  const grouped = useMemo(() => {
    const m: Partial<Record<MediaType, LibraryItem[]>> = {};
    for (const it of items) {
      (m[it.mediaType] ??= []).push(it);
    }
    return m;
  }, [items]);

  const sections = FORMAT_ORDER.flatMap((f) => {
    const list = grouped[f];
    if (!list || list.length === 0) return [];
    return [{ format: f, items: list }];
  });

  return (
    <section className="space-y-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        All watchlist items
      </h2>
      {sections.map(({ format, items: rows }) => (
        <div key={format} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${FORMAT_DOT_COLOR[format]}`}
            />
            {FORMAT_LABEL[format]}
            <span className="text-xs text-neutral-500">({rows.length})</span>
          </h3>
          <ul className="space-y-1">
            {rows.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-neutral-100">
                    {it.title}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {it.year != null ? `${it.year} · ` : ""}from {it.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function countFormats(items: LibraryItem[]): number {
  const set = new Set<MediaType>();
  for (const it of items) set.add(it.mediaType);
  return set.size;
}
