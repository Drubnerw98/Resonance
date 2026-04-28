import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi.ts";
import { ApiError } from "../lib/api.ts";
import { Skeleton } from "../components/shared/Skeleton.tsx";

interface MeResponse {
  user: {
    id: string;
    clerkId: string;
    email: string;
    displayName: string;
    onboardingStatus: "pending" | "in_progress" | "complete";
    createdAt: string;
    updatedAt: string;
  };
}

export function MePage() {
  const api = useApi();
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/me")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Unknown error",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Me</h1>
      <p className="text-sm text-neutral-400">
        End-to-end check: this page calls{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5">/api/me</code>{" "}
        with the Clerk session token. The server verifies the JWT, syncs your
        users row on first hit, and echoes it back.
      </p>

      {error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </pre>
      )}

      {!data && !error && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      )}

      {data && (
        <pre className="overflow-x-auto rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
          {JSON.stringify(data.user, null, 2)}
        </pre>
      )}
    </section>
  );
}
