import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import { useLibrary, type LibraryItem } from "../../hooks/useLibrary.ts";
import { Skeleton } from "../shared/Skeleton.tsx";
import { SectionCard } from "./SectionCard.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

// Inline color tokens for the format-share bar so each format is recognizable
// at a glance.
const FORMAT_BAR_COLOR: Record<MediaType, string> = {
  movie: "bg-rose-600",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-600",
  manga: "bg-violet-600",
  game: "bg-emerald-600",
  book: "bg-sky-600",
};

/** Library card with a horizontal stacked-bar showing format share, plus
 * counts. Visual at-a-glance for "what's in here". */
export function LibraryCard() {
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
        total === 0
          ? "Nothing imported yet"
          : `${total} item${total === 1 ? "" : "s"}`
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
          Imports anchor your recs. Works you&apos;ve loved get
          cross-referenced in explanations. Try a Letterboxd or Goodreads CSV to
          start.
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
