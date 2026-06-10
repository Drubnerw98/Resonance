/**
 * Compact one-line theme readout: label + strength bar, no prose or
 * anchors. For surfaces that want to acknowledge a theme's existence
 * without the full dossier treatment — the demo's theme tail today,
 * the profile page's weaker themes if the count ever grows.
 */
export function ThemeRow({
  label,
  weight,
  colorClass,
}: {
  label: string;
  weight: number;
  colorClass: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, weight)) * 100);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-display min-w-0 truncate text-base font-medium text-neutral-200 sm:text-lg">
        {label}
      </span>
      <div className="flex shrink-0 items-baseline gap-2">
        <div className="h-px w-24 bg-neutral-800 sm:w-32">
          <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-display text-sm tabular-nums text-neutral-500">
          {pct}
        </span>
      </div>
    </div>
  );
}
