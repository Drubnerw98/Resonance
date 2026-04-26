import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * Route-level guard. Renders <Outlet /> for signed-in users; redirects to the
 * sign-in page (preserving the attempted URL in `from`) for everyone else.
 * Shows a placeholder while Clerk is still resolving the session.
 */
export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <p className="text-neutral-500">Loading…</p>;
  }

  if (!isSignedIn) {
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
