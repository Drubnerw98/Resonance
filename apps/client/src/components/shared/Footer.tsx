import { Logo } from "./Logo.tsx";

/**
 * Footer. Minimal by design — brand mark + tagline + GitHub link + small
 * attribution. Pairs visually with the nav (same border tone, same brand
 * rhythm) so the page is bracketed by the brand.
 *
 * Layout uses flex column with `mt-auto` on the spacer so the footer
 * settles at the bottom of the viewport on short pages without floating.
 */
const GITHUB_URL = "https://github.com/Drubnerw98/Resonance";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-800 bg-neutral-950/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div className="flex items-center gap-2 text-neutral-400">
          <Logo size={16} />
          <span className="font-medium text-neutral-300">Resonance</span>
          <span className="hidden text-neutral-600 sm:inline">·</span>
          <span className="hidden sm:inline">
            cross-format recommendations grounded in your taste DNA
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-200"
          >
            GitHub
          </a>
          <span className="text-neutral-700">built with Claude</span>
        </div>
      </div>
    </footer>
  );
}
