import { Link } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";

export function HomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Resonance</h1>
        <p className="max-w-prose text-neutral-300">
          Cross-media recommendations grounded in your taste DNA — movies, TV,
          anime, manga, games, and books.
        </p>
      </div>

      <SignedOut>
        <Link
          to="/sign-in"
          className="inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
        >
          Sign in to start
        </Link>
      </SignedOut>

      <SignedIn>
        <Link
          to="/me"
          className="inline-block rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-900"
        >
          View your account
        </Link>
      </SignedIn>
    </section>
  );
}
