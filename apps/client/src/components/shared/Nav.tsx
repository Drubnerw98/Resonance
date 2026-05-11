import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { Logo } from "./Logo.tsx";

interface NavItem {
  to: string;
  label: string;
  protected?: boolean;
}

// Primary nav. Onboarding intentionally omitted — it's a one-time flow
// surfaced via the home-page CTA and the profile page's "Continue" button,
// not a nav-bar destination. /me is a dev-only debug page (also omitted).
const links: NavItem[] = [
  { to: "/recommendations", label: "Recommendations", protected: true },
  { to: "/watchlist", label: "Watchlist", protected: true },
  { to: "/lists", label: "Lists", protected: true },
  { to: "/evaluate", label: "Evaluate", protected: true },
  { to: "/profile", label: "Profile", protected: true },
];

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on every navigation. Without this, clicking a link
  // navigates but leaves the menu hanging open over the new page's content.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav className="sticky top-0 z-30 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3.5 sm:gap-5 sm:px-6 sm:py-4">
        {/* Brand block: logo + wordmark, both wrapped in a single home link
            so clicking either takes you home. */}
        <NavLink
          to="/"
          end
          className="flex shrink-0 items-center gap-2 text-neutral-100 transition-colors hover:text-white"
          onClick={() => setMenuOpen(false)}
        >
          <span className="text-emerald-300/90">
            <Logo size={20} />
          </span>
          {/* Plex Serif Italic at the wordmark slot — chrome harmonization
              across the ecosystem. Body editorial still uses Newsreader
              (font-display); this is a chrome-only override. */}
          <span className="font-['IBM_Plex_Serif'] text-lg font-medium italic">
            Resonance
          </span>
        </NavLink>

        {/* Desktop links: hidden below sm, horizontal flex above. */}
        <ul className="hidden flex-1 items-center gap-5 text-sm sm:flex sm:gap-6">
          {links.map((link) => {
            const item = (
              <li key={link.to} className="shrink-0">
                <DesktopLink to={link.to} label={link.label} />
              </li>
            );
            return link.protected ? (
              <SignedIn key={link.to}>{item}</SignedIn>
            ) : (
              item
            );
          })}
          <SignedOut>
            <li className="shrink-0">
              <NavLink
                to="/sign-in"
                className="block whitespace-nowrap py-1 text-neutral-400 hover:text-neutral-100"
              >
                Sign in
              </NavLink>
            </li>
          </SignedOut>
        </ul>

        {/* Spacer pushes the right-side controls to the edge on mobile,
            replacing the role of the flex-1 ul on desktop. */}
        <div className="flex-1 sm:hidden" />

        {/* Mobile hamburger toggle. Only signed-in users see app routes;
            for signed-out, render a plain Sign in link instead of a menu. */}
        <SignedIn>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-900 sm:hidden"
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </SignedIn>
        <SignedOut>
          <NavLink
            to="/sign-in"
            className="block shrink-0 whitespace-nowrap py-1 text-sm text-neutral-400 hover:text-neutral-100 sm:hidden"
          >
            Sign in
          </NavLink>
        </SignedOut>

        <SignedIn>
          {/* Subtle separator between app nav and account control on desktop;
              hidden on mobile since the hamburger sits to its left. */}
          <div className="hidden h-5 w-px bg-neutral-800 sm:block" />
          <div className="shrink-0">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>

      {/* Mobile slide-down menu. Renders below the nav bar when open; the
          sticky parent ensures it stays attached to the top of the viewport.
          Hidden entirely on sm+ since desktop uses the inline <ul>. */}
      <SignedIn>
        {menuOpen && (
          <div
            id="mobile-nav-menu"
            className="border-t border-neutral-800 bg-neutral-950/95 backdrop-blur-md sm:hidden"
          >
            <ul className="mx-auto flex max-w-5xl flex-col px-4 py-2">
              {links.map((link) => (
                <li key={link.to}>
                  <MobileLink to={link.to} label={link.label} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </SignedIn>
    </nav>
  );
}

function DesktopLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "relative block whitespace-nowrap py-1 text-sm tracking-tight transition-colors " +
        (isActive ? "text-white" : "text-neutral-400 hover:text-neutral-100")
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {/* Active-state accent: thin emerald underline that sits flush
              with the nav's bottom border. */}
          {isActive && (
            <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-emerald-400 sm:-bottom-[19px]" />
          )}
        </>
      )}
    </NavLink>
  );
}

function MobileLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        // Big tap target (44px+ via py-3 on text-base). Active state uses an
        // emerald left-border instead of the desktop underline since the
        // links are stacked vertically.
        "flex items-center gap-3 rounded-md border-l-2 px-3 py-3 text-base transition-colors " +
        (isActive
          ? "border-emerald-500 bg-neutral-900 text-white"
          : "border-transparent text-neutral-300 hover:bg-neutral-900 hover:text-white")
      }
    >
      {label}
    </NavLink>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}
