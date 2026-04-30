import { Logo } from "./Logo.tsx";

/**
 * Animated brand mark for AI generation states. Reuses the Logo's concentric
 * rings + ping animation to suggest "resonance radiating outward" — the brand
 * literally pulsing while the model works.
 *
 * Used during recommendation generation, evaluate scoring, theme refresh.
 * Keeps the user oriented during long (~60-100s) AI calls — perceived progress
 * without misrepresenting actual progress (we don't know intermediate state).
 */
interface Props {
  /** Optional message displayed below the pulse. */
  message?: string;
  size?: number;
}

export function LoadingPulse({ message, size = 64 }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-900/40 bg-gradient-to-br from-emerald-950/20 to-neutral-900 px-6 py-10 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Static rings + center dot */}
        <div className="text-emerald-300">
          <Logo size={size} />
        </div>
        {/* Outer ripples — two staggered ping rings so the "wave" effect is
            perpetually in motion rather than blinking off between cycles. */}
        <span
          className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-400 opacity-60"
          aria-hidden
        />
        <span
          className="absolute inset-2 animate-ping rounded-full border-2 border-emerald-500/70 opacity-50 [animation-delay:600ms]"
          aria-hidden
        />
      </div>
      {message && (
        <p className="mx-auto max-w-md text-sm text-neutral-300">{message}</p>
      )}
    </div>
  );
}
