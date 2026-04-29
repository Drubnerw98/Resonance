import { NavLink } from "react-router-dom";
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
  { to: "/explore", label: "Browse", protected: true },
  { to: "/evaluate", label: "Evaluate", protected: true },
  { to: "/lists", label: "Lists", protected: true },
  { to: "/profile", label: "Profile", protected: true },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6 sm:py-3.5">
        {/* Brand block: logo + wordmark, both wrapped in a single home link
            so clicking either takes you home. */}
        <NavLink
          to="/"
          end
          className="flex shrink-0 items-center gap-2 text-neutral-100 hover:text-white"
        >
          <Logo size={22} />
          <span className="text-base font-semibold tracking-tight">
            Resonance
          </span>
        </NavLink>

        {/* Center/right nav links. Horizontally scrollable on narrow viewports
            so the list never wraps onto two lines; scrollbar hidden for
            cleanliness on touch devices. */}
        <ul className="flex flex-1 items-center gap-5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6">
          {links.map((link) => {
            const item = (
              <li key={link.to} className="shrink-0">
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    "relative block whitespace-nowrap py-1 transition-colors " +
                    (isActive
                      ? "text-white"
                      : "text-neutral-400 hover:text-neutral-100")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {link.label}
                      {/* Active-state accent: thin emerald underline that
                          sits flush with the nav's bottom border. Empty span,
                          purely decorative; no extra DOM noise unless active. */}
                      {isActive && (
                        <span className="absolute -bottom-[15px] left-0 right-0 h-[2px] bg-emerald-500 sm:-bottom-[17px]" />
                      )}
                    </>
                  )}
                </NavLink>
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

        <SignedIn>
          {/* Subtle separator between app nav and account control so the two
              feel like distinct surfaces. */}
          <div className="hidden h-5 w-px bg-neutral-800 sm:block" />
          <div className="shrink-0">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
}
