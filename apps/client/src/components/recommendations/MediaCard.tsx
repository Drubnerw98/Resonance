import type { RecommendationItem } from "../../hooks/useRecommendations.ts";

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Game",
  book: "Book",
};

interface Props {
  rec: RecommendationItem;
}

export function MediaCard({ rec }: Props) {
  const { media, matchScore, explanation, tasteTags } = rec;
  const scorePct = Math.round(matchScore * 100);

  return (
    <article className="flex gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <a
        href={media.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="flex-shrink-0"
      >
        {media.imageUrl ? (
          <img
            src={media.imageUrl}
            alt={media.title}
            loading="lazy"
            className="h-44 w-32 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-44 w-32 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-500">
            no image
          </div>
        )}
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <header className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
            <span>{FORMAT_LABEL[media.mediaType] ?? media.mediaType}</span>
            {media.year && <span>· {media.year}</span>}
            {media.rating != null && (
              <span>· ★ {media.rating.toFixed(1)}</span>
            )}
          </div>
          <h3 className="truncate text-base font-semibold leading-tight">
            <a
              href={media.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {media.title}
            </a>
          </h3>
        </header>

        <p className="line-clamp-3 text-sm text-neutral-300">{explanation}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <ul className="flex flex-wrap gap-1.5">
            {tasteTags.map((tag, i) => (
              <li
                key={i}
                className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
              >
                {tag}
              </li>
            ))}
          </ul>
          <span
            className="text-xs font-medium text-emerald-400"
            title="match score"
          >
            {scorePct}%
          </span>
        </div>
      </div>
    </article>
  );
}
