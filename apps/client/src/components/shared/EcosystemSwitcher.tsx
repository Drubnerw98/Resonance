import { ECOSYSTEM, type EcosystemApp } from "../../lib/ecosystem.ts";

interface Props {
  /** Which app is currently rendering this switcher. Marks the entry as
   * non-clickable + accent-colored so the user knows where they are. */
  current: EcosystemApp;
  /** Size variant. `sm` is the header-corner default; `md` is for the
   * footer where it sits on its own row. */
  size?: "sm" | "md";
}

/**
 * Named chip trio identifying the three sibling apps. The current app is
 * dimmed and non-clickable ("you are here"); the other two are clickable
 * destinations. This avoids the visual doubling of the current app's name
 * being repeated alongside the wordmark/back-link elsewhere in chrome.
 */
export function EcosystemSwitcher({
  current,
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
              <span aria-current="page" className="text-neutral-700">
                {entry.name}
              </span>
            ) : (
              <a
                href={entry.url}
                className="text-neutral-400 transition-colors hover:text-neutral-100"
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
