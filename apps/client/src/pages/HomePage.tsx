import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import type { MediaType, TasteTheme } from "@resonance/shared";
import { useApi } from "../hooks/useApi.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { useBatches, type BatchSummary } from "../hooks/useBatches.ts";
import {
  useRecommendations,
  type RecommendationItem,
} from "../hooks/useRecommendations.ts";
import { useLibrary, type LibraryItem } from "../hooks/useLibrary.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

// Inline color tokens for the format-share bar so each format is recognizable
// at a glance. Tailwind classes used directly in the JSX so they're tree-shake
// friendly.
const FORMAT_BAR_COLOR: Record<MediaType, string> = {
  movie: "bg-rose-600",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-600",
  manga: "bg-violet-600",
  game: "bg-emerald-600",
  book: "bg-sky-600",
};

const STARTER_PROMPTS = [
  "A book that'll wreck me",
  "Slow burns I'll think about for weeks",
  "Old anime curated to my taste",
  "Games for a rainy weekend",
  "A movie that earns its ending",
];

export function HomePage() {
  return (
    <div>
      <SignedOut>
        <MarketingHero />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </div>
  );
}

function MarketingHero() {
  return (
    <section className="space-y-8 py-6">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Resonance
        </h1>
        <p className="max-w-prose text-lg text-neutral-300">
          Cross-media recommendations grounded in your taste DNA — movies, TV,
          anime, manga, games, and books.
        </p>
      </div>
      <Link
        to="/sign-in"
        className="inline-block rounded-md bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
      >
        Sign in to start
      </Link>
    </section>
  );
}

function Dashboard() {
  const profile = useProfile();
  const { user } = useUser();
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Up late";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);
  const name = user?.firstName ?? null;

  if (profile.state.status === "loading") {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (profile.state.status === "missing") {
    return (
      <section className="space-y-5 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting}{name ? `, ${name}` : ""}.
        </h1>
        <p className="max-w-prose text-base text-neutral-300">
          Let&apos;s build your taste profile first. Onboarding is a quick
          conversation about what you actually love and why — that&apos;s what
          everything else here runs on.
        </p>
        <Link
          to="/onboarding"
          className="inline-block rounded-md bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
        >
          Start onboarding
        </Link>
      </section>
    );
  }

  if (profile.state.status === "error") {
    return (
      <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
        Couldn&apos;t load your profile: {profile.state.message}
      </pre>
    );
  }

  return (
    <div className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
          {greeting}{name ? `, ${name}` : ""}.
        </h1>
        <p className="text-base text-neutral-400 sm:text-lg">
          What are you in the mood for?
        </p>
      </header>

      <PromptCard />

      <LatestBatchCard />

      <div className="grid gap-4 sm:grid-cols-2">
        <LibraryCard />
        <ProfileCard themes={profile.state.profile.themes} />
      </div>

      <QuickLinks />
    </div>
  );
}

/**
 * Multi-line prompt input with auto-grow and starter-prompt chips. Submit POSTs
 * to /generate then routes to /recommendations — the polling state machine on
 * that page picks up the active job on mount via the existing /active-job
 * endpoint, so we don't hold polling state here.
 */
function PromptCard() {
  const api = useApi();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to a cap. Same approach as ChatInput.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  async function submit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = prompt.trim() ? { prompt: prompt.trim() } : {};
      await api<{ jobId: string }>("/recommendations/generate", {
        method: "POST",
        body,
      });
      navigate("/recommendations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 shadow-lg shadow-black/20">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-start gap-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            rows={3}
            disabled={submitting}
            placeholder="Describe what you're in the mood for — a feeling, a shape, a comp title…"
            style={{ maxHeight: "200px" }}
            className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting}
            className="self-end rounded-md bg-white px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Generate"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Try
          </span>
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPrompt(p);
                textareaRef.current?.focus();
              }}
              disabled={submitting}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}
      </form>
    </section>
  );
}

/**
 * Most recent batch shown as a horizontal poster row. The existing
 * useRecommendations response is sorted createdAt-desc and batch-grouped, so
 * the first rec's batchId is the latest batch — pull every rec sharing that
 * batchId and show the top 5 by match score.
 */
function LatestBatchCard() {
  const recs = useRecommendations();
  const batches = useBatches();

  if (recs.status === "loading" || batches.status === "loading") {
    return (
      <SectionCard title="Latest batch">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-md" />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (recs.recommendations.length === 0) {
    return (
      <SectionCard title="Latest batch">
        <p className="text-sm text-neutral-400">
          No batches yet — your first prompt above will land here.
        </p>
      </SectionCard>
    );
  }

  const latestBatchId = recs.recommendations[0]!.batchId;
  const latestBatchRecs = recs.recommendations.filter(
    (r) => r.batchId === latestBatchId,
  );
  const topPicks = [...latestBatchRecs]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
  const batchMeta =
    batches.batches.find((b) => b.id === latestBatchId) ?? null;

  return (
    <SectionCard
      title="Latest batch"
      subtitle={batchMeta ? batchSubtitle(batchMeta) : null}
      action={
        <Link
          to={`/recommendations?batch=${latestBatchId}`}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          View this batch →
        </Link>
      }
    >
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {topPicks.map((rec) => (
          <li key={rec.id}>
            <PosterCard rec={rec} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function batchSubtitle(batch: BatchSummary): string {
  if (batch.name) return batch.name;
  if (batch.prompt) return `"${batch.prompt}"`;
  return new Date(batch.createdAt).toLocaleDateString();
}

function PosterCard({ rec }: { rec: RecommendationItem }) {
  const scorePct = Math.round(rec.matchScore * 100);
  return (
    <a
      href={rec.media.externalUrl}
      target="_blank"
      rel="noreferrer"
      className="group block space-y-1.5"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
        {rec.media.imageUrl ? (
          <img
            src={rec.media.imageUrl}
            alt={rec.media.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            {rec.media.title}
          </div>
        )}
        {/* Match score in the bottom corner — emerald accent for confidence */}
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm">
          {scorePct}%
        </span>
      </div>
      <p className="text-xs font-medium leading-snug text-neutral-200 group-hover:text-white">
        {rec.media.title}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">
        {FORMAT_LABEL[rec.media.mediaType] ?? rec.media.mediaType}
        {rec.media.year && ` · ${rec.media.year}`}
      </p>
    </a>
  );
}

/** Library card with a horizontal stacked-bar showing format share, plus
 * counts. Visual at-a-glance for "what's in here". */
function LibraryCard() {
  const lib = useLibrary();

  if (lib.status === "loading") {
    return (
      <SectionCard title="Library">
        <Skeleton className="h-24 w-full rounded-md" />
      </SectionCard>
    );
  }

  const counts = countByFormat(lib.items);
  const total = lib.items.length;
  const formatsWithCounts = (Object.entries(counts) as [MediaType, number][])
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <SectionCard
      title="Library"
      subtitle={
        total === 0 ? "Nothing imported yet" : `${total} item${total === 1 ? "" : "s"}`
      }
      action={
        <Link
          to="/profile#library"
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          Manage →
        </Link>
      }
    >
      {total === 0 ? (
        <p className="text-sm text-neutral-400">
          Imports anchor your recs — works you&apos;ve loved get cross-referenced
          in explanations. Try a Letterboxd or Goodreads CSV to start.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-2.5 overflow-hidden rounded-full border border-neutral-800 bg-neutral-950">
            {formatsWithCounts.map(([format, count]) => (
              <div
                key={format}
                style={{ width: `${(count / total) * 100}%` }}
                className={FORMAT_BAR_COLOR[format]}
                title={`${count} ${FORMAT_LABEL[format]}`}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {formatsWithCounts.map(([format, count]) => (
              <li key={format} className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${FORMAT_BAR_COLOR[format]}`}
                  aria-hidden
                />
                <span className="flex-1 text-neutral-300">
                  {FORMAT_LABEL[format]}
                </span>
                <span className="text-neutral-500">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function countByFormat(items: LibraryItem[]): Record<MediaType, number> {
  const counts: Record<MediaType, number> = {
    movie: 0,
    tv: 0,
    anime: 0,
    manga: 0,
    game: 0,
    book: 0,
  };
  for (const i of items) counts[i.mediaType]++;
  return counts;
}

/** Themes card — shows top 3 themes as filled weight bars. Visual proxy for
 * "your strongest signals". */
function ProfileCard({ themes }: { themes: TasteTheme[] }) {
  const top = [...themes].sort((a, b) => b.weight - a.weight).slice(0, 3);

  return (
    <SectionCard
      title="Top themes"
      subtitle="Your strongest signals"
      action={
        <Link
          to="/profile"
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          See all →
        </Link>
      }
    >
      {top.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Your profile doesn&apos;t have themes yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {top.map((theme) => (
            <li key={theme.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium leading-snug text-neutral-200">
                  {theme.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {Math.round(theme.weight * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  style={{ width: `${theme.weight * 100}%` }}
                  className="h-full bg-emerald-500"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function QuickLinks() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <QuickLink
        to="/explore"
        title="Browse"
        description="Curated themes for your taste."
      />
      <QuickLink
        to="/evaluate"
        title="Would I like…?"
        description="Honest verdict on a specific title."
      />
      <QuickLink
        to="/recommendations"
        title="All recommendations"
        description="Every batch, filterable by format."
      />
      <QuickLink
        to="/lists"
        title="Lists"
        description="Rename and organize your batches."
      />
    </div>
  );
}

function QuickLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-emerald-700 hover:bg-emerald-950/10"
    >
      <p className="text-sm font-medium text-neutral-100 group-hover:text-white">
        {title}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
    </Link>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string | null;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-sm leading-snug text-neutral-200">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </article>
  );
}
