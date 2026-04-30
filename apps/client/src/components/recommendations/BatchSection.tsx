import { useState, type FormEvent } from "react";
import {
  type BatchInfo,
  type RecommendationItem,
} from "../../hooks/useRecommendations.ts";
import { MediaCard } from "./MediaCard.tsx";

/** Human-readable label for a batch. Prefer name → prompt → date. */
function batchLabel(batch: BatchInfo): string {
  if (batch.name) return batch.name;
  if (batch.prompt) return `"${batch.prompt}"`;
  return `Default · ${new Date(batch.createdAt).toLocaleDateString()}`;
}

/**
 * One batch's full block — header (label + date + Refine button) and cards.
 * Refine state is local to the batch so opening the input on one doesn't
 * affect siblings. Submit composes a "${original}, but also: ${addition}"
 * prompt and kicks off a *new* batch via the parent's onRefine — original
 * stays untouched.
 */
export function BatchSection({
  batch,
  items,
  isGenerating,
  onRefine,
  onFeedback,
  onPlanTo,
  onRescore,
  rescoringIds,
}: {
  batch: BatchInfo;
  items: RecommendationItem[];
  isGenerating: boolean;
  onRefine: (addition: string) => void;
  onFeedback: (
    id: string,
    status: RecommendationItem["status"],
    rating?: number | null,
  ) => void;
  onPlanTo: (rec: RecommendationItem) => void;
  onRescore: (id: string) => void;
  rescoringIds: ReadonlySet<string>;
}) {
  const [refining, setRefining] = useState(false);
  const [addition, setAddition] = useState("");

  function handleRefineSubmit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = addition.trim();
    if (!trimmed || isGenerating) return;
    onRefine(trimmed);
    setAddition("");
    setRefining(false);
  }

  return (
    <section className="space-y-3">
      {/* Two-row header — full-width batch label on top so long prompts
          can breathe; Refine button + metadata sit on a quieter second
          row underneath. Eye lands on the prompt first, controls and
          counts second. */}
      <header className="space-y-2 border-b border-neutral-800 pb-2">
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">
          {batchLabel(batch)}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setRefining((v) => !v)}
            disabled={isGenerating}
            className={
              "rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
              (refining
                ? "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                : "border border-emerald-800/70 bg-emerald-950/30 text-emerald-300 hover:border-emerald-600 hover:bg-emerald-900/40 hover:text-emerald-100")
            }
            title="Generate a new batch with this prompt + an extra constraint"
            aria-expanded={refining}
          >
            {refining ? "Cancel" : "Refine"}
          </button>
          <span className="text-xs text-neutral-500">
            {new Date(batch.createdAt).toLocaleDateString()} · {items.length}{" "}
            {items.length === 1 ? "pick" : "picks"}
          </span>
        </div>
      </header>

      {refining && (
        <form
          onSubmit={handleRefineSubmit}
          className="flex flex-col gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label
              htmlFor={`refine-${batch.id}`}
              className="block text-xs uppercase tracking-wide text-neutral-500"
            >
              Refine with an extra constraint
            </label>
            <input
              id={`refine-${batch.id}`}
              type="text"
              value={addition}
              onChange={(e) => setAddition(e.target.value)}
              autoFocus
              disabled={isGenerating}
              placeholder={
                batch.prompt
                  ? `"${batch.prompt}", but also…`
                  : "set in the 70s · with female leads · short runtime…"
              }
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!addition.trim() || isGenerating}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate refined
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((rec) => (
          <MediaCard
            key={rec.id}
            rec={rec}
            onFeedback={onFeedback}
            onPlanTo={onPlanTo}
            onRescore={onRescore}
            isRescoring={rescoringIds.has(rec.id)}
          />
        ))}
      </div>
    </section>
  );
}
