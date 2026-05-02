import { useState } from "react";
import type { DiscoveryTheme, MediaType } from "@resonance/shared";
import { useThemes } from "../../hooks/useThemes.ts";
import { Skeleton } from "../shared/Skeleton.tsx";

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

const ACCENT_BORDERS = [
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-sky-500",
  "border-l-fuchsia-500",
  "border-l-teal-500",
];

interface Props {
  /** Fired when the user picks a theme. The parent kicks off a generate with
   * the theme's promptHint — we don't generate here so the parent's existing
   * polling state machine handles the lifecycle. */
  onPickTheme: (theme: DiscoveryTheme) => void;
  /** True when a batch is mid-generation — disables the cards. */
  disabled: boolean;
}

/**
 * Inspiration row — six AI-generated entry surfaces tailored to the user's
 * profile. Embedded inside RecommendationsPage so Browse is one tap away
 * from the prompt input rather than a separate destination. Collapsed by
 * default once the user has batches; expanded on first load.
 */
export function InspirationThemes({ onPickTheme, disabled }: Props) {
  const themes = useThemes();
  // Default-open on first paint; user can toggle. We don't persist this —
  // a fresh visit re-opens it, which is fine because it's quick to skim.
  const [open, setOpen] = useState(true);

  if (themes.status === "error") {
    // Don't blow up the recs page on a themes failure — themes are optional.
    return null;
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Need inspiration?
          </span>
          <span
            aria-hidden
            className={
              "text-neutral-500 transition-transform " +
              (open ? "rotate-180" : "")
            }
          >
            ▾
          </span>
        </button>
        <button
          type="button"
          onClick={() => void themes.refresh()}
          disabled={themes.isRefreshing || themes.status === "loading"}
          className="text-xs text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {themes.isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {open && (
        <div className="border-t border-neutral-800 p-4">
          {themes.status === "loading" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-md" />
              ))}
            </div>
          ) : themes.themes.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No themes yet. Click Refresh to generate some from your profile.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themes.themes.map((theme, i) => (
                <li key={i}>
                  <ThemeCard
                    theme={theme}
                    accentIndex={i}
                    disabled={disabled}
                    onPick={() => onPickTheme(theme)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ThemeCard({
  theme,
  accentIndex,
  disabled,
  onPick,
}: {
  theme: DiscoveryTheme;
  accentIndex: number;
  disabled: boolean;
  onPick: () => void;
}) {
  const accent = ACCENT_BORDERS[accentIndex % ACCENT_BORDERS.length];
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`group flex h-full w-full flex-col gap-2 rounded-md border border-l-4 border-neutral-800 bg-neutral-900 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 ${accent}`}
    >
      <h3 className="text-sm font-semibold leading-snug text-neutral-100 group-hover:text-white">
        {theme.title}
      </h3>
      <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-neutral-400">
        {theme.description}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {theme.formats.map((f) => (
          <li
            key={f}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${FORMAT_DOT_COLOR[f]}`}
              aria-hidden
            />
            {FORMAT_LABEL[f]}
          </li>
        ))}
      </ul>
    </button>
  );
}
