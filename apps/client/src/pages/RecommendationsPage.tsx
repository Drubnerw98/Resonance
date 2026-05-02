import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import {
  useRecommendations,
  type BatchInfo,
  type RecommendationItem,
} from "../hooks/useRecommendations.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { MediaCardSkeleton } from "../components/recommendations/MediaCardSkeleton.tsx";
import { BatchSection } from "../components/recommendations/BatchSection.tsx";
import { TabButton } from "../components/recommendations/TabButton.tsx";
import { InspirationThemes } from "../components/recommendations/InspirationThemes.tsx";
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

type SortKey =
  | "match"
  | "alpha"
  | "year-desc"
  | "year-asc"
  | "runtime-asc"
  | "runtime-desc";

const VALID_SORT_KEYS: ReadonlySet<SortKey> = new Set([
  "match",
  "alpha",
  "year-desc",
  "year-asc",
  "runtime-asc",
  "runtime-desc",
]);

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "match", label: "Match %" },
  { key: "alpha", label: "Alphabetical" },
  { key: "year-desc", label: "Year (newest)" },
  { key: "year-asc", label: "Year (oldest)" },
  { key: "runtime-asc", label: "Runtime (shortest)" },
  { key: "runtime-desc", label: "Runtime (longest)" },
];

/** Sort recs within a batch. Stable for ties so insertion order (model's
 * own ranking) carries through when a sort key is a tie. Runtime sorts push
 * null-runtime items (games / books / unenriched older recs) to the END
 * regardless of direction — a sort by runtime is implicitly "rank the items
 * I have runtime data for"; null-first would bury the actual signal. */
function sortRecs(
  recs: RecommendationItem[],
  sort: SortKey,
): RecommendationItem[] {
  const sorted = [...recs];
  switch (sort) {
    case "match":
      sorted.sort((a, b) => b.matchScore - a.matchScore);
      break;
    case "alpha":
      sorted.sort((a, b) =>
        a.media.title.localeCompare(b.media.title, undefined, {
          sensitivity: "base",
        }),
      );
      break;
    case "year-desc":
      sorted.sort((a, b) => (b.media.year ?? 0) - (a.media.year ?? 0));
      break;
    case "year-asc":
      sorted.sort((a, b) => (a.media.year ?? 9999) - (b.media.year ?? 9999));
      break;
    case "runtime-asc":
      sorted.sort((a, b) => {
        const ra = a.media.runtime ?? null;
        const rb = b.media.runtime ?? null;
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb;
      });
      break;
    case "runtime-desc":
      sorted.sort((a, b) => {
        const ra = a.media.runtime ?? null;
        const rb = b.media.runtime ?? null;
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return rb - ra;
      });
      break;
  }
  return sorted;
}

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

export function RecommendationsPage() {
  const profile = useProfile();
  const recs = useRecommendations();

  // All hooks must be called unconditionally before any early return — React's
  // Rules of Hooks. The profile-missing gate happens AFTER all the useState /
  // useSearchParams / useMemo calls below.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const batchParam = searchParams.get("batch");
  const sortParam = searchParams.get("sort");
  const activeTab: TabKey =
    tabParam && VALID_TAB_KEYS.has(tabParam as TabKey)
      ? (tabParam as TabKey)
      : "all";
  const activeSort: SortKey =
    sortParam && VALID_SORT_KEYS.has(sortParam as SortKey)
      ? (sortParam as SortKey)
      : "match";

  function setActiveTab(next: TabKey): void {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  function setActiveSort(next: SortKey): void {
    const params = new URLSearchParams(searchParams);
    if (next === "match") params.delete("sort");
    else params.set("sort", next);
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

  const visible = activeTab === "all" ? batchFiltered : buckets[activeTab];

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
  // onboarding. Same pattern as EvaluatePage.
  if (profile.state.status === "missing") {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Recommendations"
          subtitle="Cross-format picks grounded in your taste DNA."
        />
        <EmptyState
          title="No profile yet"
          description="Recommendations are generated against your taste profile. Finish onboarding first; once your profile is in, you can prompt for any kind of batch you want."
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

      {recs.refinementBanner && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 text-sm text-emerald-200">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-emerald-300">
              ✨
            </span>
            <span>
              Your profile is evolving from your recent feedback. Usually about 30 seconds.
              Refresh{" "}
              <Link to="/profile" className="underline">
                your profile
              </Link>{" "}
              in a moment to see the version bump.
            </span>
          </div>
          <button
            onClick={recs.dismissRefinementBanner}
            aria-label="Dismiss"
            className="shrink-0 rounded-md px-1 text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-200"
          >
            ×
          </button>
        </div>
      )}

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

      {/* Inspiration row — themes generated from the user's profile. Clicking
          a theme submits its promptHint as a regular generate, so the theme
          flow shares the same polling + batch-naming machinery as a typed
          prompt. Replaces the standalone /explore page (merged in). */}
      <InspirationThemes
        disabled={recs.isGenerating}
        onPickTheme={(theme) => {
          void recs.generate(theme.promptHint);
        }}
      />

      {recs.error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {recs.error}
        </pre>
      )}

      {recs.isGenerating && (
        <LoadingPulse message="AI is proposing titles, validating against TMDB / IGDB / Jikan / Open Library, and scoring against your profile. Usually 60-120 seconds." />
      )}

      {recs.recommendations.length === 0 &&
        !recs.isGenerating &&
        !recs.error && (
          <EmptyState
            title="No recommendations yet"
            description={
              <>
                Make sure you&apos;ve completed{" "}
                <Link to="/onboarding" className="underline">
                  onboarding
                </Link>{" "}
                (we need a profile to recommend against), then submit a prompt
                above, or leave it blank for a default batch.
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

      {/* Sort control — applies inside each batch's items. Default match%
          which is the model's own ranking. URL-synced so a refresh keeps it. */}
      {grouped.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <label
            htmlFor="sort"
            className="text-xs uppercase tracking-wide text-neutral-500"
          >
            Sort
          </label>
          <select
            id="sort"
            value={activeSort}
            onChange={(e) => setActiveSort(e.target.value as SortKey)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Batch-grouped feed: each batch gets a header (name/prompt/date)
          followed by its cards. When filtered to a single format tab, the
          same batches render but with only their matching items. */}
      <div className="space-y-8">
        {grouped.map(({ batch, items }) => (
          <BatchSection
            key={batch.id}
            batch={batch}
            items={sortRecs(items, activeSort)}
            isGenerating={recs.isGenerating}
            onRefine={(addition) => {
              const original = batch.prompt?.trim();
              const combined = original
                ? `${original}, but also: ${addition}`
                : addition;
              void recs.generate(combined);
            }}
            onFeedback={(id, status, rating) =>
              void recs.setFeedback(id, status, rating)
            }
            onPlanTo={(rec) => void recs.planTo(rec)}
            onRescore={(id) => void recs.rescore(id)}
            rescoringIds={recs.rescoringIds}
          />
        ))}
        {recs.isGenerating && (
          <section className="space-y-3">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-800 pb-1">
              <h2 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-neutral-400">
                {promptDraft.trim() ? `"${promptDraft.trim()}"` : "New batch"}
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
