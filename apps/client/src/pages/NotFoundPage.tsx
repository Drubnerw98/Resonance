import { Link, useLocation } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Logo } from "../components/shared/Logo.tsx";

/**
 * Catch-all 404. Replaces Vercel's bare default with a brand-consistent
 * empty-state-style screen. Shows the path that was requested (helps users
 * who got here from a typo or stale link) and offers paths back into the
 * app — different sets of links depending on whether they're signed in.
 */
export function NotFoundPage() {
  const location = useLocation();
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="text-emerald-300/90">
        <Logo size={56} />
      </div>
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
          404 · Page not found
        </p>
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-neutral-50 sm:text-5xl">
          Nothing resonates here.
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-neutral-400">
          We couldn&apos;t find{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
            {location.pathname}
          </code>
          . The page might have moved, or the link could be stale.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-white"
        >
          Back to home
        </Link>
        <SignedIn>
          <Link
            to="/recommendations"
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900"
          >
            Recommendations
          </Link>
          <Link
            to="/evaluate"
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900"
          >
            Evaluate
          </Link>
        </SignedIn>
        <SignedOut>
          <Link
            to="/sign-in"
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900"
          >
            Sign in
          </Link>
        </SignedOut>
      </div>
    </section>
  );
}
