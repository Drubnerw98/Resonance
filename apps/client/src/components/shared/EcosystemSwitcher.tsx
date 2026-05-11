import { ECOSYSTEM, type EcosystemApp } from "../../lib/ecosystem.ts";

interface Props {
  /** Which app is currently rendering this switcher. Marks the entry as
   * non-clickable + accent-colored so the user knows where they are. */
  current: EcosystemApp;
  /** Tailwind-ready text color class for the accent (current-app) state.
   * Per-app convention: Resonance = emerald, Constellation = amber-300,
   * Ensemble = saffron. Passed in so each app keeps its identity. */
  accentClassName?: string;
  /** Size variant. `sm` is the header-corner default; `md` is for the
   * footer where it sits on its own row. */
  size?: "sm" | "md";
}

/**
 * Named chip trio that names the three sibling apps and marks the current
 * one. Shared chrome pattern across Resonance / Constellation / Ensemble
 * to make the ecosystem feel like one system. Per-app accent color keeps
 * each app's identity.
 */
export function EcosystemSwitcher({
  current,
  accentClassName = "text-emerald-300",
  size = "sm",
}: Props) {
  const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  const tracking = "tracking-[0.22em]";
  return (
    <nav
      aria-label="Sibling apps"
      className={`flex items-center gap-1.5 font-['IBM_Plex_Mono'] ${textSize} ${tracking} uppercase`}
    >
      {ECOSYSTEM.map((entry, i) => {
        const isCurrent = entry.key === current;
        return (
          <span key={entry.key} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-neutral-700">
                ·
              </span>
            )}
            {isCurrent ? (
              <span aria-current="page" className={accentClassName}>
                {entry.name}
              </span>
            ) : (
              <a
                href={entry.url}
                className="text-neutral-500 transition-colors hover:text-neutral-200"
              >
                {entry.name}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
