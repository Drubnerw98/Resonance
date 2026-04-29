import { NavLink } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  protected?: boolean;
}

const links: NavItem[] = [
  { to: "/", label: "Home", end: true },
  { to: "/onboarding", label: "Onboarding", protected: true },
  { to: "/recommendations", label: "Recommendations", protected: true },
  { to: "/explore", label: "Browse", protected: true },
  { to: "/evaluate", label: "Would I like…?", protected: true },
  { to: "/lists", label: "Lists", protected: true },
  { to: "/profile", label: "Profile", protected: true },
  { to: "/me", label: "Me", protected: true },
];

export function Nav() {
  return (
    <nav className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <span className="text-lg font-semibold tracking-tight">Resonance</span>
        {/* Horizontally scrollable on narrow viewports so the link list
            never wraps onto two lines. The scrollbar is hidden on touch
            devices via -webkit-overflow-scrolling. */}
        <ul className="flex flex-1 items-center gap-4 overflow-x-auto text-sm sm:gap-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const item = (
              <li key={link.to} className="shrink-0">
                <NavLink
                  to={link.to}
                  {...(link.end ? { end: true } : {})}
                  className={({ isActive }) =>
                    "block whitespace-nowrap py-1 " +
                    (isActive
                      ? "text-white"
                      : "text-neutral-400 hover:text-neutral-200")
                  }
                >
                  {link.label}
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
                className="block whitespace-nowrap py-1 text-neutral-400 hover:text-neutral-200"
              >
                Sign in
              </NavLink>
            </li>
          </SignedOut>
        </ul>
        <SignedIn>
          <div className="shrink-0">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
}
