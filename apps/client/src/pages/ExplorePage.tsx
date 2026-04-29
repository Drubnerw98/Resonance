import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DiscoveryTheme, MediaType } from "@resonance/shared";
import { useApi } from "../hooks/useApi.ts";
import { useThemes } from "../hooks/useThemes.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";

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
  const themes = useThemes();
  const api = useApi();
  const navigate = useNavigate();
  const [generatingPromptHint, setGeneratingPromptHint] = useState<
    string | null
  >(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
    <section className="space-y-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Browse
          </h1>
          <p className="text-sm text-neutral-400">
            Curated entry surfaces tailored to your profile. No prompt needed —
            click and we&apos;ll generate a batch.
          </p>
        </div>
        <button
          onClick={() => void themes.refresh()}
          disabled={themes.isRefreshing || themes.status === "loading"}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {themes.isRefreshing ? "Refreshing…" : "Refresh themes"}
        </button>
      </header>

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

      {themes.status === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : themes.themes.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No themes yet. Try refreshing.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.themes.map((theme, i) => (
            <li key={i}>
              <ThemeCard
                theme={theme}
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

function ThemeCard({
  theme,
  onGenerate,
  isGenerating,
  disabled,
}: {
  theme: DiscoveryTheme;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled: boolean;
}) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 transition-colors hover:border-neutral-600">
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
          "self-start rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
          (isGenerating
            ? "bg-emerald-700 text-white"
            : "bg-white text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50")
        }
      >
        {isGenerating ? "Starting…" : "Show me these →"}
      </button>
    </article>
  );
}
