import { useCallback, useState } from "react";
import type { FastOnboardingFormInput, TasteProfile } from "@resonance/shared";
import { ApiError } from "../lib/api.ts";
import { useApi } from "./useApi.ts";

interface FastOnboardingResponse {
  sessionId: string;
  sessionStatus: "completed";
  profile: TasteProfile;
  version: number;
  alreadyExtracted: boolean;
}

export interface UseFastOnboarding {
  submitting: boolean;
  error: string | null;
  submit: (input: FastOnboardingFormInput) => Promise<FastOnboardingResponse>;
}

/**
 * One-shot fast-mode onboarding: POSTs the form payload, returns the saved
 * profile. The server flips onboarding_status to "complete" and persists a
 * synthetic session row, so post-submit the rest of the app sees the same
 * state long-mode produces.
 */
export function useFastOnboarding(): UseFastOnboarding {
  const api = useApi();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback<UseFastOnboarding["submit"]>(
    async (input) => {
      setError(null);
      setSubmitting(true);
      try {
        const res = await api<FastOnboardingResponse>("/onboarding/fast", {
          method: "POST",
          body: input,
        });
        return res;
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to submit form";
        setError(msg);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [api],
  );

  return { submitting, error, submit };
}
