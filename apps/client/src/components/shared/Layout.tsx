import { Outlet } from "react-router-dom";
import { Nav } from "./Nav.tsx";

export function Layout() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}