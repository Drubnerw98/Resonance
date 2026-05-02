import { Logo } from "./Logo.tsx";

/**
 * Footer. Minimal by design: brand mark + tagline + GitHub link + small
 * attribution. Pairs visually with the nav (same border tone, same brand
 * rhythm) so the page is bracketed by the brand.
 *
 * Layout uses flex column with `mt-auto` on the spacer so the footer
 * settles at the bottom of the viewport on short pages without floating.
 */
const GITHUB_URL = "https://github.com/Drubnerw98/Resonance";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-neutral-800/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-7 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div className="flex items-center gap-2.5 text-neutral-400">
          <span className="text-emerald-300/80">
            <Logo size={14} />
          </span>
          <span className="font-display text-sm font-medium tracking-tight text-neutral-200">
            Resonance
          </span>
          <span className="hidden text-neutral-700 sm:inline">·</span>
          <span className="hidden sm:inline">
            cross-format recommendations grounded in your taste DNA
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
