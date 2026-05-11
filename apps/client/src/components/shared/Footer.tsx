import { Logo } from "./Logo.tsx";
import { EcosystemSwitcher } from "./EcosystemSwitcher.tsx";

/**
 * Footer. Pairs visually with the nav (same border tone, same brand
 * rhythm) so the page is bracketed by the brand.
 *
 * Three rows on mobile, two on desktop:
 *   1. Brand mark + wordmark (Plex Serif Italic chrome) + tagline.
 *   2. EcosystemSwitcher — names the three sibling apps; marks Resonance
 *      as current. Same trio appears in Constellation and Ensemble so the
 *      family is legible at a glance from any of the three.
 *   3. GitHub + attribution.
 */
const GITHUB_URL = "https://github.com/Drubnerw98/Resonance";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-neutral-800/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 text-xs text-neutral-500 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-center gap-2.5 text-neutral-400">
            <span className="text-emerald-300/80">
              <Logo size={14} />
            </span>
            <span className="font-['IBM_Plex_Serif'] text-sm font-medium italic text-neutral-200">
              Resonance
            </span>
            <span className="hidden text-neutral-700 sm:inline">·</span>
            <span className="hidden sm:inline">
              cross-format recommendations grounded in your taste DNA
            </span>
          </div>
          <EcosystemSwitcher current="resonance" size="md" />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-neutral-900 pt-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-400 transition-colors hover:text-neutral-100"
          >
            GitHub
          </a>
          <span className="text-neutral-600">built with Claude</span>
        </div>
      </div>
    </footer>
  );
}
