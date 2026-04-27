import { Link } from "react-router-dom";
import { ProfileView } from "../components/profile/ProfileView.tsx";
import { useProfile } from "../hooks/useProfile.ts";

export function ProfilePage() {
  const state = useProfile();

  if (state.status === "loading") {
    return <p className="text-neutral-500">Loading your profile…</p>;
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
    <ProfileView
      profile={state.profile}
      version={state.version}
      updatedAt={state.updatedAt}
    />
  );
}
