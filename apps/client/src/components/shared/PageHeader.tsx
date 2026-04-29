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
    <header className="flex flex-col gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-neutral-400">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
