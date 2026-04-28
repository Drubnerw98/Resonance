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
  onFeedback: (
    recId: string,
    status: RecommendationItem["status"],
    rating?: number | null,
  ) => void;
  onRescore: (recId: string) => void;
  isRescoring: boolean;
}

export function MediaCard({ rec, onFeedback, onRescore, isRescoring }: Props) {
  const { media, matchScore, explanation, tasteTags, status, rating } = rec;
  const scorePct = Math.round(matchScore * 100);

  const isSaved = status === "saved";
  const isSkipped = status === "skipped";

  // Tone the entire card based on its feedback state.
  const cardClasses = [
    "flex gap-4 rounded-lg border p-4 transition-opacity",
    isSaved
      ? "border-emerald-700 bg-emerald-950/20"
      : "border-neutral-800 bg-neutral-900",
    isSkipped ? "opacity-50" : "opacity-100",
  ].join(" ");

  return (
    <article className={cardClasses}>
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
            className="h-32 w-24 rounded-md object-cover sm:h-44 sm:w-32"
          />
        ) : (
          <div className="flex h-32 w-24 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-500 sm:h-44 sm:w-32">
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

        <p className="text-sm leading-relaxed text-neutral-300">
          {explanation}
        </p>

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

        <FeedbackRow
          recId={rec.id}
          status={status}
          rating={rating}
          onFeedback={onFeedback}
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => onRescore(rec.id)}
            disabled={isRescoring}
            title="Rescore against your current taste profile"
            aria-label="Rescore"
            className="rounded-md p-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
          >
            <span className={isRescoring ? "inline-block animate-spin" : ""}>
              ↻
            </span>
          </button>
          <span
            className={
              "text-xs font-medium " +
              (isRescoring ? "text-neutral-500" : "text-emerald-400")
            }
            title="match score"
          >
            {isRescoring ? "rescoring…" : `${scorePct}% match`}
          </span>
        </div>
      </div>
    </article>
  );
}

function FeedbackRow({
  recId,
  status,
  rating,
  onFeedback,
}: {
  recId: string;
  status: RecommendationItem["status"];
  rating: number | null;
  onFeedback: Props["onFeedback"];
}) {
  const isSaved = status === "saved";
  const isSkipped = status === "skipped";
  const isRated = status === "rated";

  // Toggle behavior — clicking Save/Skip again returns the rec to "pending".
  function toggleSave() {
    onFeedback(recId, isSaved ? "pending" : "saved", null);
  }
  function toggleSkip() {
    onFeedback(recId, isSkipped ? "pending" : "skipped", null);
  }
  function setRating(stars: number) {
    if (isRated && rating === stars) {
      onFeedback(recId, "pending", null);
    } else {
      onFeedback(recId, "rated", stars);
    }
  }

  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        onClick={toggleSave}
        className={
          "rounded-md px-2 py-1 text-xs font-medium transition-colors " +
          (isSaved
            ? "bg-emerald-700 text-white"
            : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800")
        }
        aria-pressed={isSaved}
      >
        {isSaved ? "✓ Saved" : "Save"}
      </button>
      <button
        onClick={toggleSkip}
        className={
          "rounded-md px-2 py-1 text-xs font-medium transition-colors " +
          (isSkipped
            ? "bg-rose-900 text-white"
            : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800")
        }
        aria-pressed={isSkipped}
      >
        {isSkipped ? "✗ Skipped" : "Skip"}
      </button>
      <Stars
        value={isRated ? (rating ?? 0) : 0}
        onChange={setRating}
      />
    </div>
  );
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={
              "px-0.5 text-base leading-none transition-colors " +
              (filled
                ? "text-amber-400"
                : "text-neutral-600 hover:text-neutral-400")
            }
            aria-checked={filled}
            role="radio"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            title={`${n} star${n === 1 ? "" : "s"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
