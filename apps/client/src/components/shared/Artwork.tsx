import { useState } from "react";
import type { MediaType } from "@resonance/shared";

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Game",
  book: "Book",
};

// Tile tints reuse the per-format hue families already established by
// ProfileView's FORMAT_BAR_COLOR and the watchlist's FORMAT_TEXT_COLOR, so
// a missing cover reads as part of the same visual vocabulary instead of a
// broken image. Literal class names so Tailwind's JIT picks them up.
const FORMAT_TILE: Record<
  string,
  { bg: string; border: string; letter: string }
> = {
  movie: {
    bg: "bg-rose-950/30",
    border: "border-rose-900/40",
    letter: "text-rose-300/90",
  },
  tv: {
    bg: "bg-amber-950/30",
    border: "border-amber-900/40",
    letter: "text-amber-300/90",
  },
  anime: {
    bg: "bg-fuchsia-950/30",
    border: "border-fuchsia-900/40",
    letter: "text-fuchsia-300/90",
  },
  manga: {
    bg: "bg-violet-950/30",
    border: "border-violet-900/40",
    letter: "text-violet-300/90",
  },
  game: {
    bg: "bg-emerald-950/30",
    border: "border-emerald-900/40",
    letter: "text-emerald-300/90",
  },
  book: {
    bg: "bg-sky-950/30",
    border: "border-sky-900/40",
    letter: "text-sky-300/90",
  },
};

const NEUTRAL_TILE = {
  bg: "bg-neutral-900",
  border: "border-neutral-800",
  letter: "text-neutral-400",
};

/**
 * Format-colored stand-in for missing poster/cover art: the title's first
 * letter set in the serif display face over a per-format tint, with the
 * format as a mono eyebrow underneath. Missing art reads as designed
 * rather than as a blank box. Size comes from the caller via `className`
 * (same classes the sibling <img> would get).
 */
export function ArtworkFallback({
  title,
  mediaType,
  className = "",
}: {
  title: string;
  mediaType: MediaType | string;
  className?: string;
}) {
  const tile = FORMAT_TILE[mediaType] ?? NEUTRAL_TILE;
  const letter = (title.trim().charAt(0) || "?").toUpperCase();
  return (
    <div
      role="img"
      aria-label={`${title} (no artwork)`}
      className={`flex flex-col items-center justify-center gap-1.5 overflow-hidden border ${tile.bg} ${tile.border} ${className}`}
    >
      <span
        aria-hidden
        className={`font-display text-2xl font-medium leading-none sm:text-3xl ${tile.letter}`}
      >
        {letter}
      </span>
      <span aria-hidden className="editorial-eyebrow">
        {FORMAT_LABEL[mediaType] ?? mediaType}
      </span>
    </div>
  );
}

/**
 * Poster <img> that degrades to the ArtworkFallback tile for BOTH missing-
 * url and load-error cases — adapters sometimes hand back dead image URLs
 * (Open Library covers especially), and the two failure modes should look
 * identical. `className` is applied to whichever element renders, so
 * callers size exactly once.
 */
export function Artwork({
  url,
  title,
  mediaType,
  className = "",
}: {
  url: string | null | undefined;
  title: string;
  mediaType: MediaType | string;
  className?: string;
}) {
  // Track the URL that failed (not a boolean) so a re-render with a new
  // url gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl) {
    return (
      <ArtworkFallback
        title={title}
        mediaType={mediaType}
        className={className}
      />
    );
  }
  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={className}
    />
  );
}
