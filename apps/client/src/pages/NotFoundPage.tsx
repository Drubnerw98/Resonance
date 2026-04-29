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
      <div className="text-emerald-300">
        <Logo size={56} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          404 · Page not found
        </p>
        <h1 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Nothing resonates here
        </h1>
        <p className="mx-auto max-w-md text-sm text-neutral-400">
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
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
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
