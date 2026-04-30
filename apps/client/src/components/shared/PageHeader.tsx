import type { ReactNode } from "react";

/**
 * Canonical page header. Every top-level page uses this so titles, subtitles,
 * and right-aligned actions all have the same visual rhythm — the single
 * biggest source of "feels like one product" cohesion in the app.
 *
 * Usage:
 *   <PageHeader
 *     title="Recommendations"
 *     subtitle="32 picks across 4 lists."
 *     action={<button>Clear history</button>}
 *   />
 */
interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional right-aligned slot — usually a primary action button. */
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        {/* Accent bar — small emerald rule on the left side of the title.
            Visually anchors the page identity and ties the page header to
            the brand color used in the nav active-state and LoadingPulse. */}
        <div className="flex items-center gap-3">
          <span
            className="h-7 w-1 shrink-0 rounded-full bg-emerald-500 sm:h-9"
            aria-hidden
          />
          <h1 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="mt-2 text-sm text-neutral-400 sm:ml-4">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
