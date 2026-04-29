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

export function LoadingPulse({ message, size = 48 }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Static rings + center dot */}
        <Logo size={size} />
        {/* Outer ripple — animate-ping uses Tailwind's built-in radial scale
            + fade keyframe. The ring expands and fades; loops infinitely. */}
        <span
          className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-500 opacity-50"
          aria-hidden
        />
      </div>
      {message && (
        <p className="text-sm text-neutral-400">{message}</p>
      )}
    </div>
  );
}
