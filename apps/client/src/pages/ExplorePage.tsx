import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DiscoveryTheme, MediaType } from "@resonance/shared";
import { useApi } from "../hooks/useApi.ts";
import { useThemes } from "../hooks/useThemes.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { LoadingPulse } from "../components/shared/LoadingPulse.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

const FORMAT_BAR_COLOR: Record<MediaType, string> = {
  movie: "bg-rose-600",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-600",
  manga: "bg-violet-600",
  game: "bg-emerald-600",
  book: "bg-sky-600",
};

/**
 * Browse-mode entry surface. Six AI-generated themes tailored to the user's
 * profile + library; clicking a theme starts a normal recommendation batch
 * using the theme's promptHint as the prompt and routes to /recommendations
 * (where the polling state machine picks up the active job).
 */
export function ExplorePage() {
  const profile = useProfile();
  const themes = useThemes();
  const api = useApi();
  const navigate = useNavigate();
  const [generatingPromptHint, setGeneratingPromptHint] = useState<
    string | null
  >(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Gate on profile existence — themes are derived from the profile, so
  // landing here without one would surface an unhelpful backend error
  // ("Cannot generate themes: user has no taste profile yet"). Show a
  // friendly empty state with a route to onboarding instead.
  if (profile.state.status === "missing") {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Browse"
          subtitle="Curated entry surfaces tailored to your profile."
        />
        <EmptyState
          title="No profile yet"
          description="Browse themes are generated from your taste DNA. Finish onboarding first — once your profile lands, six themes show up here."
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

  async function handleGenerate(theme: DiscoveryTheme) {
    if (generatingPromptHint) return;
    setGeneratingPromptHint(theme.promptHint);
    setGenerateError(null);
    try {
      await api<{ jobId: string }>("/recommendations/generate", {
        method: "POST",
        body: { prompt: theme.promptHint },
      });
      navigate("/recommendations");
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to start generation",
      );
      setGeneratingPromptHint(null);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Browse"
        subtitle="Curated entry surfaces tailored to your profile. No prompt needed — click and we'll generate a batch."
        action={
          <button
            onClick={() => void themes.refresh()}
            disabled={themes.isRefreshing || themes.status === "loading"}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {themes.isRefreshing ? "Refreshing…" : "Refresh themes"}
          </button>
        }
      />

      {themes.error && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {themes.error}
        </pre>
      )}
      {generateError && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {generateError}
        </pre>
      )}

      {generatingPromptHint && (
        <LoadingPulse message="Generating a batch from this theme. Usually 60-120 seconds." />
      )}

      {themes.status === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : themes.themes.length === 0 ? (
        <EmptyState
          title="No themes yet"
          description="Try refreshing — themes are generated from your current profile."
          action={
            <button
              onClick={() => void themes.refresh()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Refresh themes
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.themes.map((theme, i) => (
            <li key={i}>
              <ThemeCard
                theme={theme}
                accentIndex={i}
                onGenerate={() => void handleGenerate(theme)}
                isGenerating={generatingPromptHint === theme.promptHint}
                disabled={generatingPromptHint != null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Per-card accent palette — cycles through 6 hues so each theme card on a
// 6-grid has its own visual identity. Used as a left-border accent and a
// subtle title-hover tint.
const THEME_ACCENTS = [
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-sky-500",
  "border-l-fuchsia-500",
  "border-l-teal-500",
];

function ThemeCard({
  theme,
  accentIndex,
  onGenerate,
  isGenerating,
  disabled,
}: {
  theme: DiscoveryTheme;
  accentIndex: number;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled: boolean;
}) {
  const accent = THEME_ACCENTS[accentIndex % THEME_ACCENTS.length];
  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-xl border border-l-4 border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-600 ${accent}`}
    >
      <header className="space-y-2">
        <h2 className="text-base font-semibold leading-snug text-neutral-100">
          {theme.title}
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {theme.formats.map((f) => (
            <li
              key={f}
              className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${FORMAT_BAR_COLOR[f]}`}
                aria-hidden
              />
              {FORMAT_LABEL[f]}
            </li>
          ))}
        </ul>
      </header>

      <p className="flex-1 text-sm leading-relaxed text-neutral-300">
        {theme.description}
      </p>

      <button
        onClick={onGenerate}
        disabled={disabled}
        className={
          "self-start rounded-md px-4 py-2 text-sm font-semibold transition-colors " +
          (isGenerating
            ? "bg-emerald-700 text-white"
            : "bg-emerald-600 text-neutral-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500")
        }
      >
        {isGenerating ? "Starting…" : "Show me these →"}
      </button>
    </article>
  );
}
