import { Link } from "react-router-dom";
import type { TasteTheme } from "@resonance/shared";
import { SectionCard } from "./SectionCard.tsx";

// Distinct hue per top theme, in display order. Emerald → teal → amber.
// Makes each theme bar feel like its own thing rather than three identical
// progress bars stacked.
const THEME_BAR_COLORS = ["bg-emerald-500", "bg-teal-500", "bg-amber-500"];

/** Themes card — shows top 3 themes as filled weight bars. Visual proxy for
 * "your strongest signals". */
export function ProfileCard({ themes }: { themes: TasteTheme[] }) {
  const top = [...themes].sort((a, b) => b.weight - a.weight).slice(0, 3);

  return (
    <SectionCard
      title="Top themes"
      subtitle="Your strongest signals"
      action={
        <Link
          to="/profile"
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          See all →
        </Link>
      }
    >
      {top.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Your profile doesn&apos;t have themes yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {top.map((theme, i) => (
            <li key={theme.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium leading-snug text-neutral-200">
                  {theme.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {Math.round(theme.weight * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  style={{ width: `${theme.weight * 100}%` }}
                  className={`h-full ${THEME_BAR_COLORS[i] ?? "bg-emerald-500"}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
