import type { MediaType } from "@resonance/shared";

/**
 * Per-format SVG glyph used across the app. Vocabulary matches Constellation
 * (its `glyph.tsx`) so the two apps share one visual language for media types.
 *
 *   movie  → circle
 *   tv     → triangle (up)
 *   anime  → hexagon
 *   game   → diamond
 *   manga  → 5-point star
 *   book   → 4-point sparkle star
 *
 * Drawn in a viewBox of -10..10 on each axis so a single size knob (`size`)
 * sets the pixel footprint and shapes have roughly equal visual area.
 */
export function FormatGlyph({
  format,
  size = 12,
  className = "",
  title,
}: {
  format: MediaType | string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      fill="currentColor"
    >
      {title && <title>{title}</title>}
      <GlyphShape format={format} />
    </svg>
  );
}

function GlyphShape({ format }: { format: MediaType | string }) {
  switch (format) {
    case "movie":
      return <circle cx={0} cy={0} r={7.5} />;
    case "tv":
      return <polygon points="0,-8.5 7.4,5.5 -7.4,5.5" strokeLinejoin="round" />;
    case "anime":
      return (
        <polygon points="0,-9 7.8,-4.5 7.8,4.5 0,9 -7.8,4.5 -7.8,-4.5" />
      );
    case "game":
      return <polygon points="0,-9 9,0 0,9 -9,0" />;
    case "manga":
      return <polygon points={starPoints(5, 9, 3.6)} strokeLinejoin="round" />;
    case "book":
      return <polygon points={starPoints(4, 9, 3)} strokeLinejoin="round" />;
    default:
      return <circle cx={0} cy={0} r={3} />;
  }
}

function starPoints(count: number, outerR: number, innerR: number): string {
  const total = count * 2;
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    out.push(`${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`);
  }
  return out.join(" ");
}
