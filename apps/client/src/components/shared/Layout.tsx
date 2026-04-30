import { Outlet, useLocation } from "react-router-dom";
import { Nav } from "./Nav.tsx";
import { Footer } from "./Footer.tsx";
import { SessionExpiredBanner } from "./SessionExpiredBanner.tsx";

export function Layout() {
  // Re-key the main element on pathname change so React remounts the
  // route's content; combined with the page-fade keyframe in globals.css
  // this gives every route navigation a brief opacity fade-in. ~150ms,
  // imperceptible enough to feel "polished" but not slow.
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      <SessionExpiredBanner />
      <Nav />
      <main
        key={pathname}
        className="mx-auto w-full max-w-5xl flex-1 animate-page-fade px-4 py-6 sm:px-6 sm:py-10"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
