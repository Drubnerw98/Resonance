import { useState } from "react";
import type { TasteProfile } from "@resonance/shared";
import type {
  RecommendationCrossReference,
  RecommendationItem,
} from "../../hooks/useRecommendations.ts";
import { CrossReferenceModal } from "./CrossReferenceModal.tsx";

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movie",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Game",
  book: "Book",
};

/** "2h 14m" for movies; "45 min/ep" for TV. Null check is the caller's job. */
function formatRuntime(minutes: number, mediaType: string): string {
  if (mediaType === "tv") return `${minutes} min/ep`;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

interface Props {
  rec: RecommendationItem;
  /** Active profile, used by the cross-reference evidence modal to look up
   * theme/archetype evidence quotes mentioning a referenced title. Null while
   * the profile is loading or if the user is somehow rec-list-without-profile
   * (the page already gates on this; null here just means "skip the
   * evidence section"). */
  profile: TasteProfile | null;
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
  profile,
  onFeedback,
  onPlanTo,
  onRescore,
  isRescoring,
}: Props) {
  const { media, matchScore, explanation, tasteTags, crossReferences, status, rating } =
    rec;
  const [activeCrossRef, setActiveCrossRef] =
    useState<RecommendationCrossReference | null>(null);
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

  // Editorial direction: no bordered card enclosure. Hairline rule above
  // anchors each rec as a clipping. Saved/skipped states are signaled by
  // a thin left-margin accent + opacity instead of full card-bg color.
  const articleClasses = [
    "editorial-hairline group flex gap-5 pt-6 transition-opacity duration-200 sm:gap-7",
    isSkipped ? "opacity-40" : "opacity-100",
    isSaved ? "border-l border-emerald-500/60 pl-5 sm:pl-6" : "",
    pulse ? "animate-feedback-pulse" : "",
  ].join(" ");

  return (
    <article className={articleClasses}>
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
            className="h-32 w-24 rounded-sm object-cover transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-44 sm:w-32"
          />
        ) : (
          <div className="flex h-32 w-24 items-center justify-center rounded-sm border border-neutral-800 text-[10px] text-neutral-500 sm:h-44 sm:w-32">
            no image
          </div>
        )}
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <header className="min-w-0 space-y-1.5">
            <div className="editorial-eyebrow flex flex-wrap items-baseline gap-x-1.5">
              <span>{FORMAT_LABEL[media.mediaType] ?? media.mediaType}</span>
              {media.year && <span>· {media.year}</span>}
              {media.runtime != null && (
                <span>· {formatRuntime(media.runtime, media.mediaType)}</span>
              )}
              {media.rating != null && (
                <span>· ★ {media.rating.toFixed(1)}</span>
              )}
            </div>
            <h3 className="font-display text-xl font-medium leading-[1.15] tracking-tight text-neutral-50 sm:text-2xl">
              <a
                href={media.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                {media.title}
              </a>
            </h3>
          </header>
          {/* Match score as a magazine numeral — large, recessive color,
              tabular figures. Replaces "94% match" badge with a
              typographic moment. */}
          <button
            type="button"
            onClick={() => onRescore(rec.id)}
            disabled={isRescoring}
            title="Match score · click to rescore against your current taste profile"
            aria-label={isRescoring ? "Rescoring" : `Match score ${scorePct}, click to rescore`}
            className={
              "shrink-0 text-right transition-opacity duration-200 disabled:opacity-50 " +
              (isRescoring ? "animate-pulse" : "")
            }
          >
            <span className="font-display text-3xl leading-none font-medium tabular-nums text-emerald-300 sm:text-4xl">
              {scorePct}
            </span>
            <span className="editorial-eyebrow ml-1 text-emerald-300/60">
              match
            </span>
          </button>
        </div>

        <p className="text-[14px] leading-relaxed text-neutral-300 sm:text-[15px]">
          {explanation}
        </p>

        {tasteTags.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="editorial-eyebrow shrink-0">Tagged</span>
            <ul className="flex flex-wrap gap-1.5">
              {tasteTags.map((tag, i) => (
                <li
                  key={i}
                  className="rounded-full border border-emerald-700/35 bg-emerald-950/15 px-2.5 py-0.5 text-[12px] text-neutral-100"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {crossReferences.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="editorial-eyebrow shrink-0">
              Because you loved
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {crossReferences.map((cr, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setActiveCrossRef(cr)}
                    className="rounded-full border border-amber-700/40 bg-amber-950/15 px-2.5 py-0.5 text-[12px] text-amber-200 transition-colors duration-200 hover:border-amber-400/60 hover:text-amber-100"
                    aria-label={`See why ${cr.title} anchored this rec`}
                  >
                    {cr.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FeedbackRow
          recId={rec.id}
          status={status}
          rating={rating}
          onFeedback={withPulse(onFeedback)}
          onPlanTo={withPulse(() => onPlanTo(rec))}
        />
      </div>
      <CrossReferenceModal
        open={activeCrossRef !== null}
        crossRef={activeCrossRef}
        recTitle={media.title}
        profile={profile}
        onClose={() => setActiveCrossRef(null)}
      />
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
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2.5 pt-2">
      <ActionLink onClick={toggleSave} active={isSaved} accent="emerald">
        {isSaved ? "Saved" : "Save"}
      </ActionLink>
      <ActionLink
        onClick={onPlanTo}
        disabled={isPlanTo}
        active={isPlanTo}
        accent="amber"
      >
        {isPlanTo ? "On watchlist" : "Plan to"}
      </ActionLink>
      <ActionLink onClick={toggleSkip} active={isSkipped} accent="neutral">
        {isSkipped ? "Skipped" : "Skip"}
      </ActionLink>
      {/* Stars reflect the rating column directly — independent of status.
          Saved + rated 4★ shows both: emerald underline + filled stars. */}
      <Stars value={rating ?? 0} onChange={setRating} />
    </div>
  );
}

/**
 * Editorial text-link action. Replaces the bordered/filled button trio with
 * Save · Plan to · Skip rendered as text with a hairline underline that
 * highlights to the accent on hover. Active state keeps the underline at
 * full accent and recolors the text. Less SaaS-action-row, more editorial.
 */
function ActionLink({
  onClick,
  disabled,
  active,
  accent,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active: boolean;
  accent: "emerald" | "amber" | "neutral";
  children: React.ReactNode;
}) {
  const accentBase = {
    emerald: {
      activeUnderline: "border-emerald-400",
      activeText: "text-emerald-200",
      restUnderline: "border-neutral-700",
      hoverUnderline: "group-hover:border-emerald-400",
    },
    amber: {
      activeUnderline: "border-amber-400",
      activeText: "text-amber-200",
      restUnderline: "border-neutral-700",
      hoverUnderline: "group-hover:border-amber-400",
    },
    neutral: {
      activeUnderline: "border-neutral-400",
      activeText: "text-neutral-400",
      restUnderline: "border-neutral-700",
      hoverUnderline: "group-hover:border-neutral-300",
    },
  }[accent];
  const underline = active
    ? accentBase.activeUnderline
    : `${accentBase.restUnderline} ${accentBase.hoverUnderline}`;
  const text = active ? accentBase.activeText : "text-neutral-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="group inline-flex items-baseline text-[13px] transition-colors duration-200 disabled:cursor-default disabled:opacity-60"
    >
      <span
        className={`border-b pb-0.5 transition-colors duration-200 ${underline} ${text}`}
      >
        {children}
      </span>
    </button>
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
      className="ml-auto flex items-center gap-0.5"
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
              "px-0.5 text-[15px] leading-none transition-colors duration-200 " +
              (filled
                ? isPreview
                  ? "text-amber-300/80"
                  : "text-amber-400"
                : "text-neutral-700 hover:text-neutral-400")
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
