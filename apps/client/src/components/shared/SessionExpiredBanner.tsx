import { useEffect, useState } from "react";
import { SignedIn } from "@clerk/clerk-react";

/**
 * Fixed top-of-viewport banner that surfaces when any API call comes back
 * 401. Triggered by the `resonance:session-expired` window event fired in
 * `lib/api.ts`. Clicking Refresh reloads — Clerk's long-lived db_jwt cookie
 * usually re-establishes the session silently; if it's also expired,
 * RequireAuth bounces the user to /sign-in.
 *
 * Only renders inside SignedIn — a 401 hitting a signed-out user is just
 * the auth gate doing its job; no banner needed.
 */
export function SessionExpiredBanner() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    function onExpired() {
      setShown(true);
    }
    window.addEventListener("resonance:session-expired", onExpired);
    return () => {
      window.removeEventListener("resonance:session-expired", onExpired);
    };
  }, []);

  if (!shown) return null;

  return (
    <SignedIn>
      <div
        role="alert"
        className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-900/60 bg-amber-950/80 px-4 py-2 text-sm text-amber-100 backdrop-blur-md"
      >
        <span>
          Your session looks expired. Refresh to sign back in — your work is
          safe.
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-white"
          >
            Refresh
          </button>
          <button
            onClick={() => setShown(false)}
            aria-label="Dismiss"
            className="rounded-md px-1.5 py-1 text-amber-300 hover:bg-amber-900/40 hover:text-amber-100"
          >
            ×
          </button>
        </div>
      </div>
    </SignedIn>
  );
}
