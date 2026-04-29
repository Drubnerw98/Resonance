import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import {
  useRecommendations,
  type BatchInfo,
  type RecommendationItem,
} from "../hooks/useRecommendations.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { MediaCard } from "../components/recommendations/MediaCard.tsx";
import { MediaCardSkeleton } from "../components/recommendations/MediaCardSkeleton.tsx";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { LoadingPulse } from "../components/shared/LoadingPulse.tsx";

type TabKey = "all" | MediaType;

const VALID_TAB_KEYS: ReadonlySet<TabKey> = new Set([
  "all",
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

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

/** Group an ordered list of recs into [batch, recs[]] groups, preserving
 * original ordering. Used for the batch-headed feed view. */
function groupByBatch(
  recs: RecommendationItem[],
): { batch: BatchInfo; items: RecommendationItem[] }[] {
  const out: { batch: BatchInfo; items: RecommendationItem[] }[] = [];
  for (const r of recs) {
    const last = out[out.length - 1];
    if (last && last.batch.id === r.batchId) {
      last.items.push(r);
    } else {
      out.push({ batch: r.batch, items: [r] });
    }
  }
  return out;
}

/** Human-readable label for a batch. Prefer name → prompt → date. */
function batchLabel(batch: BatchInfo): string {
  if (batch.name) return batch.name;
  if (batch.prompt) return `"${batch.prompt}"`;
  return `Default · ${new Date(batch.createdAt).toLocaleDateString()}`;
}

export function RecommendationsPage() {
  const profile = useProfile();
  const recs = useRecommendations();

  // All hooks must be called unconditionally before any early return — React's
  // Rules of Hooks. The profile-missing gate happens AFTER all the useState /
  // useSearchParams / useMemo calls below.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const batchParam = searchParams.get("batch");
  const activeTab: TabKey =
    tabParam && VALID_TAB_KEYS.has(tabParam as TabKey)
      ? (tabParam as TabKey)
      : "all";

  function setActiveTab(next: TabKey): void {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  function clearBatchFilter(): void {
    const params = new URLSearchParams(searchParams);
    params.delete("batch");
    setSearchParams(params, { replace: true });
  }

  const [promptDraft, setPromptDraft] = useState("");

  // Apply ?batch=<id> filter first, then ?tab=<format> on top.
  const batchFiltered = useMemo(
    () =>
      batchParam
        ? recs.recommendations.filter((r) => r.batchId === batchParam)
        : recs.recommendations,
    [recs.recommendations, batchParam],
  );

  const buckets = useMemo(() => bucketByType(batchFiltered), [batchFiltered]);

  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((t) => buckets[t.key].length > 0),
    [buckets],
  );

  const visible =
    activeTab === "all" ? batchFiltered : buckets[activeTab];

  const grouped = useMemo(() => groupByBatch(visible), [visible]);
  const focusedBatch = batchParam ? grouped[0]?.batch : null;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const prompt = promptDraft.trim();
    void recs.generate(prompt || undefined);
    setPromptDraft("");
  }

  // Gate on profile existence — without a profile, generation throws server-
  // side. Surface the missing-profile state explicitly with a route to
  // onboarding. Same pattern as ExplorePage / EvaluatePage.
  if (profile.state.status === "missing") {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Recommendations"
          subtitle="Cross-format picks grounded in your taste DNA."
        />
        <EmptyState
          title="No profile yet"
          description="Recommendations are generated against your taste profile. Finish onboarding first — once your profile is in, you can prompt for any kind of batch you want."
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

  if (recs.status === "loading") {
    return (
      <section className="space-y-6">
        <PageHeader title="Recommendations" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  const subtitle = focusedBatch ? (
    <>
      Viewing one list ·{" "}
      <button
        onClick={clearBatchFilter}
        className="underline hover:text-neutral-300"
      >
        show all
      </button>
    </>
  ) : recs.recommendations.length === 0 ? (
    "Generate a fresh batch grounded in your taste DNA."
  ) : (
    `${recs.recommendations.length} picks across ${grouped.length} ${grouped.length === 1 ? "list" : "lists"}.`
  );

  return (
    <section className="space-y-6">
      <PageHeader
        title="Recommendations"
        subtitle={subtitle}
        action={
          recs.recommendations.length > 0 ? (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Delete all your recommendations and lists? (Profile and onboarding stay.)",
                  )
                ) {
                  void recs.clear();
                }
              }}
              disabled={recs.isGenerating}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear history
            </button>
          ) : null
        }
      />

      {/* Prompt + Generate. The prompt is optional — empty submission still
          generates a default batch grounded in the profile. */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="prompt"
            className="block text-xs uppercase tracking-wide text-neutral-500"
          >
            What kind of thing are you in the mood for?
          </label>
          <input
            id="prompt"
            type="text"
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            disabled={recs.isGenerating}
            placeholder="e.g. a movie that'll make me cry · book series like Red Rising · old anime curated to me"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={recs.isGenerating}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recs.isGenerating
            ? "Generating…"
            : promptDraft.trim()
              ? "Generate list"
              : "Generate batch"}
        </button>
      </form>

      {recs.error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {recs.error}
        </pre>
      )}

      {recs.isGenerating && (
        <LoadingPulse message="AI is proposing titles, validating against TMDB / IGDB / Jikan / Open Library, and scoring against your profile. Usually 60-120 seconds." />
      )}

      {recs.recommendations.length === 0 && !recs.isGenerating && !recs.error && (
        <EmptyState
          title="No recommendations yet"
          description={
            <>
              Make sure you&apos;ve completed{" "}
              <Link to="/onboarding" className="underline">
                onboarding
              </Link>{" "}
              (we need a profile to recommend against), then submit a prompt
              above — or leave it blank for a default batch.
            </>
          }
        />
      )}

      {visibleTabs.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      {/* Batch-grouped feed: each batch gets a header (name/prompt/date)
          followed by its cards. When filtered to a single format tab, the
          same batches render but with only their matching items. */}
      <div className="space-y-8">
        {grouped.map(({ batch, items }) => (
          <section key={batch.id} className="space-y-3">
            <header className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-1">
              <h2 className="truncate text-base font-semibold">
                {batchLabel(batch)}
              </h2>
              <span className="shrink-0 text-xs text-neutral-500">
                {new Date(batch.createdAt).toLocaleDateString()} ·{" "}
                {items.length} {items.length === 1 ? "pick" : "picks"}
              </span>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((rec) => (
                <MediaCard
                  key={rec.id}
                  rec={rec}
                  onFeedback={(id, status, rating) =>
                    void recs.setFeedback(id, status, rating)
                  }
                  onRescore={(id) => void recs.rescore(id)}
                  isRescoring={recs.rescoringIds.has(rec.id)}
                />
              ))}
            </div>
          </section>
        ))}
        {recs.isGenerating && (
          <section className="space-y-3">
            <header className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-1">
              <h2 className="truncate text-base font-semibold text-neutral-400">
                {promptDraft.trim()
                  ? `"${promptDraft.trim()}"`
                  : "New batch"}
              </h2>
              <span className="shrink-0 text-xs text-neutral-500">
                generating…
              </span>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <MediaCardSkeleton key={`skel-${i}`} />
              ))}
            </div>
          </section>
        )}
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
