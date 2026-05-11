import type { ReactNode } from "react";
import { Logo } from "./Logo.tsx";

/**
 * Visual anchor for "nothing here yet" states across the app. Replaces bare
 * text-only emptiness with a logo-anchored card that feels designed instead
 * of forgotten.
 *
 * The logo grounds the empty state in the brand — even before any content
 * exists, the user sees the same visual mark they see in the nav.
 *
 * Usage:
 *   <EmptyState
 *     title="No batches yet"
 *     description="Your first prompt above will land here."
 *     action={<Link to="/onboarding">Start onboarding</Link>}
 *   />
 */
interface Props {
  title: string;
  description?: ReactNode;
  /** Optional CTA — usually a Link or button. */
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="editorial-hairline flex flex-col items-center gap-5 px-6 py-14 text-center sm:py-20">
      <div className="text-emerald-300/60">
        <Logo size={32} />
      </div>
      <div className="space-y-3">
        <h2 className="font-display text-xl font-medium italic leading-tight text-neutral-100 sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mx-auto max-w-md text-[14px] leading-relaxed text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}
