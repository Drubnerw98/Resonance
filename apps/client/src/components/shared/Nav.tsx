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
  { to: "/profile", label: "Profile", protected: true },
  { to: "/me", label: "Me", protected: true },
];

export function Nav() {
  return (
    <nav className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Resonance</span>
        <ul className="flex items-center gap-6 text-sm">
          {links.map((link) => {
            const item = (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  {...(link.end ? { end: true } : {})}
                  className={({ isActive }) =>
                    isActive
                      ? "text-white"
                      : "text-neutral-400 hover:text-neutral-200"
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
            <li>
              <NavLink
                to="/sign-in"
                className="text-neutral-400 hover:text-neutral-200"
              >
                Sign in
              </NavLink>
            </li>
          </SignedOut>
          <SignedIn>
            <li className="flex items-center">
              <UserButton afterSignOutUrl="/" />
            </li>
          </SignedIn>
        </ul>
      </div>
    </nav>
  );
}
