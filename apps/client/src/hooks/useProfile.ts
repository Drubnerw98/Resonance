import { useEffect, useState } from "react";
import type { TasteProfile } from "@resonance/shared";
import { useApi } from "./useApi.ts";
import { ApiError } from "../lib/api.ts";

interface ProfileResponse {
  id: string;
  version: number;
  data: TasteProfile;
  createdAt: string;
  updatedAt: string;
}

export type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: TasteProfile; version: number; updatedAt: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export function useProfile(): ProfileState {
  const api = useApi();
  const [state, setState] = useState<ProfileState>({ status: "loading" });

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

  return state;
}
