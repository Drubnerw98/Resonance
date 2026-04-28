import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import {
  useRecommendations,
  type RecommendationItem,
} from "../hooks/useRecommendations.ts";
import { MediaCard } from "../components/recommendations/MediaCard.tsx";

type TabKey = "all" | MediaType;

const TAB_ORDER: { key: MediaType; label: string }[] = [
  { key: "movie", label: "Movies" },
  { key: "tv", label: "TV" },
  { key: "anime", label: "Anime" },
  { key: "manga", label: "Manga" },
  { key: "game", label: "Games" },
  { key: "book", label: "Books" },
];

function bucketByType(
  recs: RecommendationItem[],
): Record<MediaType, RecommendationItem[]> {
  const buckets: Record<MediaType, RecommendationItem[]> = {
    movie: [],
    tv: [],
    anime: [],
    manga: [],
    game: [],
    book: [],
  };
  for (const r of recs) {
    buckets[r.media.mediaType].push(r);
  }
  return buckets;
}

export function RecommendationsPage() {
  const recs = useRecommendations();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const buckets = useMemo(
    () => bucketByType(recs.recommendations),
    [recs.recommendations],
  );

  // Only show a tab if it has at least one rec. Keeps the tab bar tight when
  // a format is missing from a given run.
  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((t) => buckets[t.key].length > 0),
    [buckets],
  );

  const visible =
    activeTab === "all"
      ? recs.recommendations
      : buckets[activeTab];

  if (recs.status === "loading") {
    return <p className="text-neutral-500">Loading recommendations…</p>;
  }

  return (
    <section className="space-y-6">
      <header className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Recommendations</h1>
          <p className="text-sm text-neutral-500">
            {recs.recommendations.length === 0
              ? "Generate a fresh batch grounded in your taste DNA."
              : `${recs.recommendations.length} picks across formats. Generate again any time.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {recs.recommendations.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Delete all your recommendations? (Profile and onboarding stay.)",
                  )
                ) {
                  void recs.clear();
                }
              }}
              disabled={recs.isGenerating}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear history
            </button>
          )}
          <button
            onClick={() => void recs.generate()}
            disabled={recs.isGenerating}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {recs.isGenerating ? "Generating…" : "Generate batch"}
          </button>
        </div>
      </header>

      {recs.error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {recs.error}
        </pre>
      )}

      {recs.isGenerating && (
        <p className="text-sm text-neutral-400">
          AI is proposing titles, validating them against TMDB / IGDB / Jikan
          / Open Library, and scoring each against your profile. This usually
          takes 15-40 seconds.
        </p>
      )}

      {recs.recommendations.length === 0 && !recs.isGenerating && !recs.error && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
          No recommendations yet. Make sure you&apos;ve completed{" "}
          <Link to="/onboarding" className="underline">
            onboarding
          </Link>{" "}
          (we need a profile to recommend against), then click{" "}
          <strong>Generate batch</strong>.
        </div>
      )}

      {/* Tabs — only render when there's a multi-format spread to choose from. */}
      {visibleTabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-neutral-800">
          <TabButton
            label="All"
            count={recs.recommendations.length}
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
          />
          {visibleTabs.map((t) => (
            <TabButton
              key={t.key}
              label={t.label}
              count={buckets[t.key].length}
              active={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
            />
          ))}
        </nav>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((rec) => (
          <MediaCard key={rec.id} rec={rec} />
        ))}
      </div>
    </section>
  );
}

function TabButton({
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
        "relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
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
