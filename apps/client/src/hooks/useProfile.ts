import { useCallback, useEffect, useState } from "react";
import type { TasteProfile } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

interface ProfileResponse {
  id: string;
  version: number;
  data: TasteProfile;
  createdAt?: string;
  updatedAt: string;
  /** Number of recs the user has acted on. Powers the maturity badge — fast-
   * mode profiles start thin and the badge tells the user feedback sharpens
   * the system. Only present on GET /profile, not on refine/update responses
   * which return profile data only. */
  actedRecCount?: number;
}

export type ProfileStatus =
  | { status: "loading" }
  | {
      status: "ready";
      profile: TasteProfile;
      version: number;
      updatedAt: string;
      actedRecCount: number;
    }
  | { status: "missing" }
  | { status: "error"; message: string };

export interface UseProfile {
  state: ProfileStatus;
  isRefining: boolean;
  refineError: string | null;
  refine: () => Promise<void>;
  isUpdating: boolean;
  updateError: string | null;
  /** Persist a manually-edited profile via PUT /api/profile. Resolves with
   * the saved profile on success; throws on validation/persist failure so
   * the caller can keep edit mode open instead of dropping the user's work. */
  update: (profile: TasteProfile) => Promise<TasteProfile>;
}

export function useProfile(): UseProfile {
  const api = useApi();
  const [state, setState] = useState<ProfileStatus>({ status: "loading" });
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ProfileResponse>("/profile")
      .then((res) => {
        if (cancelled) return;
        setState({
          status: "ready",
          profile: res.data,
          version: res.version,
          updatedAt: res.updatedAt,
          actedRecCount: res.actedRecCount ?? 0,
        });
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

  const refine = useCallback(async () => {
    if (isRefining) return;
    setIsRefining(true);
    setRefineError(null);
    try {
      const res = await api<ProfileResponse>("/profile/refine", {
        method: "POST",
      });
      // refine/update don't return actedRecCount (those operations don't
      // change feedback count), so preserve the prior value rather than
      // resetting it to 0 and visibly reverting the maturity badge.
      setState((prev) => ({
        status: "ready",
        profile: res.data,
        version: res.version,
        updatedAt: res.updatedAt,
        actedRecCount:
          prev.status === "ready" ? prev.actedRecCount : (res.actedRecCount ?? 0),
      }));
    } catch (err) {
      setRefineError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to refine",
      );
    } finally {
      setIsRefining(false);
    }
  }, [api, isRefining]);

  const update = useCallback(
    async (profile: TasteProfile): Promise<TasteProfile> => {
      if (isUpdating) throw new Error("update already in progress");
      setIsUpdating(true);
      setUpdateError(null);
      try {
        const res = await api<ProfileResponse>("/profile", {
          method: "PUT",
          body: profile,
        });
        setState((prev) => ({
          status: "ready",
          profile: res.data,
          version: res.version,
          updatedAt: res.updatedAt,
          actedRecCount:
            prev.status === "ready"
              ? prev.actedRecCount
              : (res.actedRecCount ?? 0),
        }));
        return res.data;
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to save";
        setUpdateError(msg);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [api, isUpdating],
  );

  return {
    state,
    isRefining,
    refineError,
    refine,
    isUpdating,
    updateError,
    update,
  };
}
