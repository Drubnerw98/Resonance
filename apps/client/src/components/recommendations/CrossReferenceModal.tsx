import { useEffect } from "react";
import { Link } from "react-router-dom";
import { titleAppearsIn, type TasteProfile } from "@resonance/shared";
import type { RecommendationCrossReference } from "../../hooks/useRecommendations.ts";

interface Props {
  open: boolean;
  crossRef: RecommendationCrossReference | null;
  recTitle: string;
  profile: TasteProfile | null;
  onClose: () => void;
}

/**
 * Click-through detail for a "because you loved X" chip on a rec card.
 * Surfaces the model's per-rec rationale plus any profile theme / archetype
 * evidence that mentions the cross-referenced title — letting the user see
 * exactly what about their stated taste anchored this rec.
 *
 * The evidence-quote lookup uses `titleAppearsIn` (shared with the
 * Constellation export pipeline) so a long title cited in evidence by its
 * short form ("First Law" vs "First Law Trilogy") still surfaces.
 */
export function CrossReferenceModal({
  open,
  crossRef,
  recTitle,
  profile,
  onClose,
}: Props) {
  // Esc-to-close. Listening at the window level since the modal blocks
  // pointer events anyway, and we don't want focus trickery to fight us.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !crossRef) return null;

  const matchedThemes = profile
    ? profile.themes.filter((t) => titleAppearsIn(crossRef.title, t.evidence))
    : [];
  const matchedArchetypes = profile
    ? profile.archetypes.filter((a) =>
        titleAppearsIn(crossRef.title, a.attraction),
      )
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crossref-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
      onClick={onClose}
    >
      <div
        // Stop click-through so clicking inside the modal doesn't dismiss.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 rounded-lg border border-neutral-700 bg-neutral-950 p-6 shadow-2xl"
      >
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Why this anchored
          </p>
          <h2
            id="crossref-title"
            className="font-display text-xl font-medium leading-tight tracking-tight text-neutral-50"
          >
            {crossRef.title}
            <span className="text-neutral-500"> → {recTitle}</span>
          </h2>
        </header>

        <p className="rounded-md border border-emerald-800/40 bg-emerald-950/20 p-3 text-sm leading-relaxed text-emerald-100">
          {crossRef.reason}
        </p>

        {(matchedThemes.length > 0 || matchedArchetypes.length > 0) && (
          <section className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              From your profile
            </p>
            <ul className="space-y-2">
              {matchedThemes.map((t, i) => (
                <li
                  key={`theme-${i}`}
                  className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3"
                >
                  <p className="text-xs font-medium text-emerald-300">
                    Theme · {t.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-300">
                    {t.evidence}
                  </p>
                </li>
              ))}
              {matchedArchetypes.map((a, i) => (
                <li
                  key={`archetype-${i}`}
                  className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3"
                >
                  <p className="text-xs font-medium text-emerald-300">
                    Archetype · {a.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-300">
                    {a.attraction}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-3">
          <Link
            to="/profile#library"
            onClick={onClose}
            className="text-xs text-emerald-400 underline-offset-2 hover:underline"
          >
            View in library →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
