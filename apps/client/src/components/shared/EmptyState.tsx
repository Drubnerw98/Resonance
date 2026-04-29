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
    <div className="flex flex-col items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-6 py-10 text-center">
      <Logo size={36} />
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
        {description && (
          <p className="mx-auto max-w-md text-sm text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
