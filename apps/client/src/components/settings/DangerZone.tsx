import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi.ts";

/**
 * Account-level destructive action: wipe the taste profile + onboarding chat
 * history and start fresh. Recommendations and library are deliberately left
 * intact — the confirm() copy spells that out. Lifted off /profile when the
 * /settings route landed.
 */
export function DangerZone() {
  const api = useApi();
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleResetProfile() {
    const ok = confirm(
      "Start over from scratch?\n\n" +
        "This will delete:\n" +
        "  • Your taste profile and all profile versions\n" +
        "  • Your onboarding chat history\n\n" +
        "These will NOT be deleted (clear them separately if you want):\n" +
        "  • Your recommendations and batches\n" +
        "  • Your imported library\n\n" +
        "After reset you'll be sent back to onboarding to build a fresh profile.",
    );
    if (!ok) return;
    setIsResetting(true);
    setResetError(null);
    try {
      await api("/profile/reset", { method: "POST" });
      navigate("/onboarding");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-400">Danger zone</h2>
      {resetError && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {resetError}
        </pre>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-900/40 bg-rose-950/10 p-3">
        <p className="text-sm text-neutral-400">
          Wipe your taste profile and onboarding chat history, then start fresh.
          Recommendations and library stay.
        </p>
        <button
          onClick={() => void handleResetProfile()}
          disabled={isResetting}
          className="rounded-md border border-rose-900 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start over from scratch
        </button>
      </div>
    </section>
  );
}
