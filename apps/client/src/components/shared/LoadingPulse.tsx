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
    <div className="editorial-hairline flex flex-col items-center gap-5 px-6 py-14 text-center sm:py-20">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Static rings + center dot */}
        <div className="text-emerald-300">
          <Logo size={size} />
        </div>
        {/* Outer ripples — two staggered ping rings so the "wave" effect is
            perpetually in motion rather than blinking off between cycles. */}
        <span
          className="absolute inset-0 animate-ping rounded-full border border-emerald-400/70"
          aria-hidden
        />
        <span
          className="absolute inset-2 animate-ping rounded-full border border-emerald-500/50 [animation-delay:600ms]"
          aria-hidden
        />
      </div>
      {message && (
        <p className="mx-auto max-w-md text-[14px] italic leading-relaxed text-neutral-300">
          {message}
        </p>
      )}
    </div>
  );
}
