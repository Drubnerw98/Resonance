import type { ReactNode } from "react";

/**
 * Canonical page header. Every top-level page uses this so titles, subtitles,
 * and right-aligned actions all have the same visual rhythm. The single
 * biggest source of "feels like one product" cohesion in the app.
 *
 * Editorial treatment: Newsreader display serif for the title, hairline rule
 * underneath, optional small-caps eyebrow above. Replaces the prior
 * gradient-text-with-emerald-bar pattern with something that reads as a
 * magazine masthead and matches the marketing surface.
 *
 * Usage:
 *   <PageHeader
 *     eyebrow="Library"
 *     title="Recommendations"
 *     subtitle="32 picks across 4 lists."
 *     action={<button>Clear history</button>}
 *   />
 */
interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional small-caps label rendered above the title. */
  eyebrow?: string;
  /** Optional right-aligned slot, usually a primary action button. */
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, action }: Props) {
  return (
    <header className="flex flex-col gap-5 border-b border-neutral-800/60 pb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-3">
        {eyebrow && <p className="editorial-eyebrow">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-medium leading-[1.05] tracking-tight text-neutral-50 sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-2xl text-[15px] leading-relaxed text-neutral-400">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
