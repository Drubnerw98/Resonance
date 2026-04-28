import { Link } from "react-router-dom";
import { ProfileView } from "../components/profile/ProfileView.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { useProfile } from "../hooks/useProfile.ts";

export function ProfilePage() {
  const { state, isRefining, refineError, refine } = useProfile();

  if (state.status === "loading") {
    return (
      <div className="space-y-8">
        <div className="space-y-2 border-b border-neutral-800 pb-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <section key={i} className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-44" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {state.message}
      </pre>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">No profile yet</h1>
        <p className="max-w-prose text-neutral-400">
          You haven&apos;t finished onboarding, or the profile extraction
          didn&apos;t run. Head back to onboarding — when the conversation has
          enough signal, the &quot;Generate profile&quot; button extracts your
          taste DNA from the transcript.
        </p>
        <Link
          to="/onboarding"
          className="inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
        >
          Go to onboarding
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {refineError && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {refineError}
        </pre>
      )}

      <ProfileView
        profile={state.profile}
        version={state.version}
        updatedAt={state.updatedAt}
        onRefine={() => void refine()}
        isRefining={isRefining}
      />
    </div>
  );
}
