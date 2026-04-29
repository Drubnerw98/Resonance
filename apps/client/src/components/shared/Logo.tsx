/**
 * Resonance brand mark — three concentric rings (decreasing opacity inward
 * to outward → outward) around a filled center dot. Reads as a ripple /
 * sympathetic vibration, which is what the product does conceptually:
 * one input (your taste DNA) resonates outward across formats.
 *
 * Inline SVG with `currentColor` so it picks up the surrounding text color —
 * white in the nav, but the same component would work in a light surface
 * with no changes. Scale-friendly via the size prop.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.7"
      />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
    </svg>
  );
}
