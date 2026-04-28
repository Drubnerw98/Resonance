/**
 * Generic skeleton placeholder. Renders a pulsing neutral-toned div sized by
 * Tailwind classes you pass in. Combine via composition for richer shapes.
 *
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-44 w-32 rounded-md" />
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-neutral-800/70 ${className}`}
      aria-hidden
    />
  );
}
