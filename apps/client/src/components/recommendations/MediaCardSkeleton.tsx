import { Skeleton } from "../shared/Skeleton.tsx";

/**
 * Mirrors the visual shape of MediaCard so the layout doesn't jump when
 * real cards arrive. Used during a /generate poll while we're waiting on
 * the AI pipeline.
 */
export function MediaCardSkeleton() {
  return (
    <article
      className="flex gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
      aria-busy="true"
      aria-label="Loading recommendation"
    >
      <Skeleton className="h-32 w-24 flex-shrink-0 rounded-md sm:h-44 sm:w-32" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-3/5" />
        <div className="space-y-1.5 pt-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </article>
  );
}
