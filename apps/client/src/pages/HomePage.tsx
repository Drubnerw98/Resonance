import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useProfile } from "../hooks/useProfile.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { LandingPage } from "../components/marketing/LandingPage.tsx";
import { PromptCard } from "../components/home/PromptCard.tsx";
import { LatestBatchCard } from "../components/home/LatestBatchCard.tsx";
import { LibraryCard } from "../components/home/LibraryCard.tsx";
import { ProfileCard } from "../components/home/ProfileCard.tsx";
import { QuickLinks } from "../components/home/QuickLinks.tsx";

export function HomePage() {
  return (
    <div>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </div>
  );
}

function Dashboard() {
  const profile = useProfile();
  const { user } = useUser();
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Up late";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);
  const name = user?.firstName ?? null;

  if (profile.state.status === "loading") {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (profile.state.status === "missing") {
    return (
      <section className="space-y-5 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting}
          {name ? `, ${name}` : ""}.
        </h1>
        <p className="max-w-prose text-base text-neutral-300">
          Let&apos;s build your taste profile first. Onboarding is a quick
          conversation about what you actually love and why — that&apos;s what
          everything else here runs on.
        </p>
        <Link
          to="/onboarding"
          className="inline-block rounded-md bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
        >
          Start onboarding
        </Link>
      </section>
    );
  }

  if (profile.state.status === "error") {
    return (
      <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
        Couldn&apos;t load your profile: {profile.state.message}
      </pre>
    );
  }

  return (
    <div className="space-y-6 py-2 sm:py-4">
      {/* Tightened hero — smaller gap to the prompt card so the prompt is
          clearly the primary action above the fold. */}
      <header className="space-y-1">
        <h1 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          {greeting}
          {name ? `, ${name}` : ""}.
        </h1>
        <p className="text-sm text-neutral-400 sm:text-base">
          What are you in the mood for?
        </p>
      </header>

      <PromptCard />

      <LatestBatchCard />

      <div className="grid gap-4 sm:grid-cols-2">
        <LibraryCard />
        <ProfileCard themes={profile.state.profile.themes} />
      </div>

      <QuickLinks />
    </div>
  );
}
