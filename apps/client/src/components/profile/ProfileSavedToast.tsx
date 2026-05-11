import { useEffect, useState } from "react";

/**
 * Toast that pops in when the profile is saved. Sparkle + slide-up + scale
 * combo so the save feels like something rather than nothing. Auto-dismisses
 * after ~3 seconds.
 *
 * Mounting strategy: parent renders this only when `version` changes (i.e.
 * after a successful save). The toast manages its own lifecycle via a
 * mounted/exiting state machine; once exiting completes the parent should
 * unmount it.
 */
export function ProfileSavedToast({
  version,
  onDismiss,
}: {
  version: number;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    const exit = window.setTimeout(() => setPhase("exit"), 2800);
    const unmount = window.setTimeout(() => onDismiss(), 3100);
    return () => {
      window.clearTimeout(exit);
      window.clearTimeout(unmount);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:bottom-8"
    >
      <div
        className={
          "pointer-events-auto flex items-center gap-3 rounded-full border border-emerald-700/50 bg-emerald-950/95 px-4 py-2 text-sm text-emerald-100 shadow-[0_8px_30px_rgba(0,0,0,0.55)] backdrop-blur-md " +
          (phase === "enter" ? "animate-toast-rise" : "animate-toast-fade")
        }
      >
        <Sparkle />
        <span className="font-medium">Profile saved</span>
        <span className="text-emerald-400/80">·</span>
        <span className="text-emerald-300/90 tabular-nums">v{version}</span>
      </div>
    </div>
  );
}

/** Custom sparkle so we're not stuck with a system emoji glyph. Same
 * 4-point star shape as the book glyph in FormatGlyph, sized for inline use
 * and twinkling on its own animation loop. */
function Sparkle() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="-12 -12 24 24"
      aria-hidden
      className="animate-sparkle text-emerald-300"
    >
      <polygon
        points="0,-10 2.5,-2.5 10,0 2.5,2.5 0,10 -2.5,2.5 -10,0 -2.5,-2.5"
        fill="currentColor"
      />
    </svg>
  );
}
