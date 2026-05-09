import { useEffect, useState } from "react";
import type { ProfileTrigger, TasteProfile } from "@resonance/shared";
import { ApiError } from "../lib/api.ts";
import { useApi } from "./useApi.ts";

export interface ProfileVersionEntry {
  id: string;
  versionNumber: number;
  trigger: ProfileTrigger;
  profile: TasteProfile;
  createdAt: string;
}

interface VersionsResponse {
  versions: ProfileVersionEntry[];
}

export type VersionsState =
  | { status: "loading" }
  | { status: "ready"; versions: ProfileVersionEntry[] }
  | { status: "missing" }
  | { status: "error"; message: string };

/**
 * Fetches the user's full profile evolution history. Lightweight — single
 * GET, no polling — but loaded lazily by the timeline component so the
 * profile page doesn't block on it.
 */
export function useProfileVersions(): VersionsState {
  const api = useApi();
  const [state, setState] = useState<VersionsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api<VersionsResponse>("/profile/versions")
      .then((res) => {
        if (cancelled) return;
        setState({ status: "ready", versions: res.versions });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: "missing" });
        } else {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return state;
}
