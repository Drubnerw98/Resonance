import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { TasteProfile } from "@resonance/shared";
import { ProfileView } from "../components/profile/ProfileView.tsx";
import { ProfileEditor } from "../components/profile/ProfileEditor.tsx";
import { LibrarySection } from "../components/profile/LibrarySection.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { useProfile } from "../hooks/useProfile.ts";
import { useApi } from "../hooks/useApi.ts";

export function ProfilePage() {
  const {
    state,
    isRefining,
    refineError,
    refine,
    isUpdating,
    updateError,
    update,
  } = useProfile();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  async function handleSave(profile: TasteProfile) {
    try {
      await update(profile);
      setIsEditing(false);
    } catch {
      // updateError is set by the hook; keep edit mode open so the user
      // can fix and retry without losing their work.
    }
  }

  // Scroll to anchored section after profile data renders. Re-runs when state
  // becomes "ready" because the section we're targeting (e.g. #library) only
  // mounts once data is loaded — running on initial navigation alone would
  // miss the element.
  useEffect(() => {
    if (state.status !== "ready") return;
    const hash = location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, state.status]);

  async function handleContinueOnboarding() {
    if (isStartingSession) return;
    setIsStartingSession(true);
    setContinueError(null);
    try {
      await api("/onboarding/restart", { method: "POST" });
      navigate("/onboarding");
    } catch (err) {
      setContinueError(
        err instanceof Error ? err.message : "Failed to start session",
      );
    } finally {
      setIsStartingSession(false);
    }
  }

  async function handleResetProfile() {
    const ok = confirm(
      "Start over from scratch?\n\n" +
        "This will delete:\n" +
        "  • Your taste profile and all profile versions\n" +
        "  • Your onboarding chat history\n\n" +
        "These will NOT be deleted (clear them separately if you want):\n" +
        "  • Your recommendations and lists\n" +
        "  • Your imported library\n\n" +
        "After reset you'll be sent back to onboarding to build a fresh profile.",
    );
    if (!ok) return;
    setIsStartingSession(true);
    setContinueError(null);
    try {
      await api("/profile/reset", { method: "POST" });
      navigate("/onboarding");
    } catch (err) {
      setContinueError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setIsStartingSession(false);
    }
  }

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
          didn&apos;t run. Head back to onboarding. When the conversation has
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
      {(refineError || continueError) && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {refineError ?? continueError}
        </pre>
      )}

      {isEditing ? (
        <ProfileEditor
          initial={state.profile}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          isSaving={isUpdating}
          error={updateError}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900"
              title="Manually edit any field the AI got wrong"
            >
              Edit profile
            </button>
          </div>
          <ProfileView
            profile={state.profile}
            version={state.version}
            updatedAt={state.updatedAt}
            onRefine={() => void refine()}
            onContinueOnboarding={() => void handleContinueOnboarding()}
            isRefining={isRefining}
            isStartingSession={isStartingSession}
          />
        </>
      )}

      <LibrarySection />

      <section className="space-y-2 border-t border-neutral-800 pt-4">
        <h2 className="text-sm font-semibold text-neutral-400">Danger zone</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-900/40 bg-rose-950/10 p-3">
          <p className="text-sm text-neutral-400">
            Wipe your taste profile and onboarding chat history, then start
            fresh. Recommendations and library stay.
          </p>
          <button
            onClick={() => void handleResetProfile()}
            disabled={isStartingSession}
            className="rounded-md border border-rose-900 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start over from scratch
          </button>
        </div>
      </section>
    </div>
  );
}
