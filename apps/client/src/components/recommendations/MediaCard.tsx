import { useState } from "react";
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
  onPlanTo: (rec: RecommendationItem) => void;
  onRescore: (recId: string) => void;
  isRescoring: boolean;
}

export function MediaCard({
  rec,
  onFeedback,
  onPlanTo,
  onRescore,
  isRescoring,
}: Props) {
  const { media, matchScore, explanation, tasteTags, status, rating } = rec;
  const scorePct = Math.round(matchScore * 100);

  const isSaved = status === "saved";
  const isSkipped = status === "skipped";

  // Brief feedback-pulse animation on Save / Skip / Plan-to / Rate.
  // Triggered by setting `pulse` true; auto-clears after the keyframe
  // duration so it can re-fire on the next click.
  const [pulse, setPulse] = useState(false);
  function withPulse<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      fn(...args);
      setPulse(true);
      window.setTimeout(() => setPulse(false), 400);
    };
  }

  // Tone the entire card based on its feedback state.
  const cardClasses = [
    "flex gap-4 rounded-lg border p-4 transition-all duration-200",
    isSaved
      ? "border-emerald-700 bg-emerald-950/20"
      : "border-neutral-800 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-900/80",
    isSkipped ? "opacity-40 saturate-50" : "opacity-100",
    pulse ? "animate-feedback-pulse" : "",
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
          <h3 className="text-base font-semibold leading-tight">
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
              className="rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-0.5 text-xs text-emerald-200/90"
            >
              {tag}
            </li>
          ))}
        </ul>

        <FeedbackRow
          recId={rec.id}
          status={status}
          rating={rating}
          onFeedback={withPulse(onFeedback)}
          onPlanTo={withPulse(() => onPlanTo(rec))}
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
  onPlanTo,
}: {
  recId: string;
  status: RecommendationItem["status"];
  rating: number | null;
  onFeedback: Props["onFeedback"];
  onPlanTo: () => void;
}) {
  const isSaved = status === "saved";
  const isSkipped = status === "skipped";
  const isPlanTo = status === "plan_to";

  // Save/Skip toggle the *status*, never touch the rating column. Pass
  // `undefined` so the PATCH body omits rating entirely (backend leaves
  // the column alone). Lets a user save AND keep their stars visible.
  function toggleSave() {
    onFeedback(recId, isSaved ? "pending" : "saved", undefined);
  }
  function toggleSkip() {
    onFeedback(recId, isSkipped ? "pending" : "skipped", undefined);
  }
  // Rating click: number sets it; clicking the same star you already gave
  // sends an explicit `null` to clear it (and resets status to "pending"
  // unless we want to keep it saved — see below). Status flips to "rated"
  // when setting a new rating.
  function setRating(stars: number) {
    if (rating === stars) {
      // Toggling the same star off — clear rating, status back to pending
      // unless it's saved (preserve saved-ness, just remove the stars).
      onFeedback(recId, isSaved ? "saved" : "pending", null);
    } else {
      // Setting a rating doesn't unset saved — flip status to "rated" only
      // if not currently saved. Saved + rated coexist via rating column.
      onFeedback(recId, isSaved ? "saved" : "rated", stars);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
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
        onClick={onPlanTo}
        disabled={isPlanTo}
        title="Add to your watchlist — won't be re-recommended"
        className={
          "rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default " +
          (isPlanTo
            ? "bg-amber-700 text-white"
            : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800")
        }
        aria-pressed={isPlanTo}
      >
        {isPlanTo ? "★ On watchlist" : "Plan to"}
      </button>
      <button
        onClick={toggleSkip}
        className={
          "rounded-md px-2 py-1 text-xs font-medium transition-colors " +
          (isSkipped
            ? "border border-neutral-700 bg-neutral-800 text-neutral-400"
            : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800")
        }
        aria-pressed={isSkipped}
      >
        {isSkipped ? "✗ Skipped" : "Skip"}
      </button>
      {/* Stars reflect the rating column directly — independent of status.
          Saved + rated 4★ shows both: emerald Save button + filled stars. */}
      <Stars value={rating ?? 0} onChange={setRating} />
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
  // Hover preview: hovered star and everything left of it light up before
  // commit. Mouse-leave snaps back to the actual rating. Small interaction
  // upgrade — makes ratings feel responsive rather than static.
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      aria-label="Rating"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display;
        const isPreview = hover > 0 && n <= hover && n > value;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className={
              "px-0.5 text-base leading-none transition-colors " +
              (filled
                ? isPreview
                  ? "text-amber-300/80"
                  : "text-amber-400"
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
