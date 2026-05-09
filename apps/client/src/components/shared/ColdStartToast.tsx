import { useEffect, useState } from "react";

/**
 * Surfaces a small toast when an API request stays in flight long enough to
 * indicate Render's free-tier cold start (~30s after 15min idle). We listen
 * for the `resonance:slow-fetch` event fired from `apiFetch` and show the
 * toast for the remainder of the slow window. Auto-dismisses on the next
 * `resonance:slow-fetch:settled` event so the toast doesn't linger.
 *
 * Once-per-page-load only. After the first dismissal we don't re-show — the
 * user understands what's going on, and repeat warnings on every slow fetch
 * would be noise.
 */
export function ColdStartToast() {
  const [visible, setVisible] = useState(false);
  const [shownThisLoad, setShownThisLoad] = useState(false);

  useEffect(() => {
    function onSlow() {
      if (shownThisLoad) return;
      setVisible(true);
      setShownThisLoad(true);
    }
    function onSettled() {
      setVisible(false);
    }
    window.addEventListener("resonance:slow-fetch", onSlow);
    window.addEventListener("resonance:slow-fetch:settled", onSettled);
    return () => {
      window.removeEventListener("resonance:slow-fetch", onSlow);
      window.removeEventListener("resonance:slow-fetch:settled", onSettled);
    };
  }, [shownThisLoad]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform rounded-md border border-amber-700/60 bg-amber-950/90 px-4 py-2 text-xs text-amber-200 shadow-lg backdrop-blur-sm"
    >
      Waking the server (~30s on the free tier)…
    </div>
  );
}
