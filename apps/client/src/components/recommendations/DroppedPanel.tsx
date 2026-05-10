import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi.ts";

type DroppedReason =
  | "avoidance"
  | "disliked-title"
  | "format-disabled"
  | "duplicate"
  | "hallucinated"
  | "scored-and-dropped";

interface DroppedCandidate {
  title: string;
  mediaType?: "movie" | "tv" | "anime" | "manga" | "game" | "book";
  reason: DroppedReason;
  detail?: string;
}

interface DropsResponse {
  batchId: string;
  dropped: DroppedCandidate[];
  summary: {
    count: number;
    byReason: Record<DroppedReason, number>;
  };
}

const VISIBLE_CAP = 30;

/** Short user-facing label per reason. The badge color is keyed off these. */
const REASON_LABEL: Record<DroppedReason, string> = {
  avoidance: "matches an avoidance pattern",
  "disliked-title": "you've disliked this title",
  "format-disabled": "format turned off",
  duplicate: "duplicate / already on your radar",
  hallucinated: "no real metadata match",
  "scored-and-dropped": "model judged a poor fit",
};

const REASON_BADGE_CLASS: Record<DroppedReason, string> = {
  avoidance: "bg-rose-950/40 text-rose-300 border-rose-900/60",
  "disliked-title": "bg-rose-950/40 text-rose-300 border-rose-900/60",
  "format-disabled": "bg-amber-950/40 text-amber-300 border-amber-900/60",
  duplicate: "bg-neutral-900 text-neutral-400 border-neutral-800",
  hallucinated: "bg-violet-950/40 text-violet-300 border-violet-900/60",
  "scored-and-dropped":
    "bg-neutral-900 text-neutral-400 border-neutral-800",
};

const MEDIA_TYPE_LABEL: Record<NonNullable<DroppedCandidate["mediaType"]>, string> = {
  movie: "Movie",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Game",
  book: "Book",
};

/**
 * Per-batch collapsible "what got filtered" panel. Surfaces the
 * anti-hallucination + format-enforcement + cross-batch dedup story to the
 * user (it's currently invisible). Lazy-fetched on expand so the page-load
 * payload doesn't bloat. Closed by default.
 *
 * If `summary.count === 0` we render the positive empty-state inline (no
 * fetch needed). Older batches predating the dropped_candidates column have
 * a default `[]` and read as zero — semantically correct (we don't know
 * what was dropped historically).
 */
export function DroppedPanel({
  batchId,
  initialSummary,
}: {
  batchId: string;
  /** From the batches list — lets us render the count without fetching. */
  initialSummary?: { count: number; byReason: Record<DroppedReason, number> };
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DropsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Fetch on first expand only.
  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    setError(null);
    api<DropsResponse>(`/recommendations/batches/${batchId}/drops`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load drops");
        setLoading(false);
      });
  }, [open, data, loading, api, batchId]);

  const summary = data?.summary ?? initialSummary ?? null;
  const totalCount = summary?.count ?? 0;

  const buttonLabel = totalCount === 0
    ? "What got filtered"
    : `What got filtered (${totalCount})`;

  return (
    <details
      className="group rounded-md border border-neutral-800 bg-neutral-950/40"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs uppercase tracking-wide text-neutral-400 hover:text-neutral-200">
        <span className="select-none">
          <span aria-hidden className="mr-1.5 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          {buttonLabel}
        </span>
      </summary>

      <div className="space-y-3 border-t border-neutral-800 p-3">
        {totalCount === 0 ? (
          <p className="text-sm text-emerald-300">
            No dropped candidates — every model suggestion landed cleanly.
          </p>
        ) : null}

        {totalCount > 0 && loading && (
          <p className="text-sm text-neutral-500">Loading…</p>
        )}

        {error && (
          <p className="text-sm text-red-300">{error}</p>
        )}

        {data && data.dropped.length > 0 && (
          <DroppedList items={data.dropped} showAll={showAll} onShowAll={() => setShowAll(true)} />
        )}
      </div>
    </details>
  );
}

function DroppedList({
  items,
  showAll,
  onShowAll,
}: {
  items: DroppedCandidate[];
  showAll: boolean;
  onShowAll: () => void;
}) {
  const visible = showAll ? items : items.slice(0, VISIBLE_CAP);
  const hidden = items.length - visible.length;
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 text-sm">
        {visible.map((d, i) => (
          <li
            key={`${d.title}-${i}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span className="text-neutral-200">{d.title}</span>
            {d.mediaType && (
              <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                {MEDIA_TYPE_LABEL[d.mediaType]}
              </span>
            )}
            <span
              className={
                "rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                REASON_BADGE_CLASS[d.reason]
              }
              title={d.detail}
            >
              {REASON_LABEL[d.reason]}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={onShowAll}
          className="text-xs text-neutral-400 underline hover:text-neutral-200"
        >
          Show all {items.length}
        </button>
      )}
    </div>
  );
}
