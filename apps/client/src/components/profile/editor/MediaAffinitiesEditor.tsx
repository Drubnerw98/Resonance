import type { MediaAffinity, MediaType } from "@resonance/shared";
import { ChipList, Labeled, Section } from "./primitives.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

const FORMAT_ORDER: MediaType[] = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
];

export function MediaAffinitiesEditor({
  affinities,
  onChange,
}: {
  affinities: MediaAffinity[];
  onChange: (next: MediaAffinity[]) => void;
}) {
  // Build a map for O(1) lookup. Format itself is fixed; only comfort and
  // favorites are user-editable. Formats that aren't in the profile yet are
  // shown as "Add to profile" entries — clicking adds them with comfort=0.5.
  const byFormat = new Map(affinities.map((a) => [a.format, a]));

  function updateAt(format: MediaType, patch: Partial<MediaAffinity>) {
    onChange(
      affinities.map((a) => (a.format === format ? { ...a, ...patch } : a)),
    );
  }
  function addFormat(format: MediaType) {
    onChange([...affinities, { format, comfort: 0.5, favorites: [] }]);
  }
  function removeFormat(format: MediaType) {
    onChange(affinities.filter((a) => a.format !== format));
  }

  return (
    <Section
      title="Media affinities"
      hint="Which formats you want recommendations from. Disabled formats never appear in batches, themes, or evaluations — the recommender hard-filters them out."
    >
      <ul className="space-y-3">
        {FORMAT_ORDER.map((format) => {
          const a = byFormat.get(format);
          if (!a) {
            return (
              <li
                key={format}
                className="flex items-center justify-between gap-3 rounded-md border border-dashed border-neutral-800 bg-neutral-900/40 p-3 opacity-70"
              >
                <span className="flex items-center gap-2 text-sm text-neutral-400">
                  {FORMAT_LABEL[format]}
                  <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    Disabled
                  </span>
                </span>
                <button
                  onClick={() => addFormat(format)}
                  className="rounded-md border border-emerald-800/70 bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:border-emerald-600 hover:bg-emerald-900/40"
                >
                  Enable
                </button>
              </li>
            );
          }
          return (
            <li
              key={format}
              className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  {FORMAT_LABEL[format]}
                  <span className="rounded-full border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                    Enabled
                  </span>
                </span>
                <button
                  onClick={() => removeFormat(format)}
                  className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-rose-800 hover:text-rose-300"
                  title="Disable this format — it'll be hard-filtered from all recommendations"
                >
                  Disable
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">Comfort</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={a.comfort}
                  onChange={(e) =>
                    updateAt(format, { comfort: Number(e.target.value) })
                  }
                  className="flex-1 accent-emerald-500"
                />
                <span className="w-10 text-right text-xs text-neutral-400">
                  {Math.round(a.comfort * 100)}%
                </span>
              </div>
              <Labeled label="Favorites">
                <ChipList
                  items={a.favorites}
                  placeholder="Add a favorite title…"
                  onChange={(favorites) => updateAt(format, { favorites })}
                />
              </Labeled>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
