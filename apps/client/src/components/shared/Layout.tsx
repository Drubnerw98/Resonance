import { Outlet } from "react-router-dom";
import { Nav } from "./Nav.tsx";
import { Footer } from "./Footer.tsx";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}