import type { MediaType, TasteTheme, TitleRef } from "@resonance/shared";
import { AddButton, RemoveButton, Section } from "./primitives.tsx";

const MEDIA_TYPES: MediaType[] = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
];
const MEDIA_LABEL: Record<MediaType, string> = {
  movie: "Movie",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Game",
  book: "Book",
};

export function ThemesEditor({
  themes,
  onChange,
}: {
  themes: TasteTheme[];
  onChange: (next: TasteTheme[]) => void;
}) {
  function update(i: number, patch: Partial<TasteTheme>) {
    onChange(themes.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function remove(i: number) {
    onChange(themes.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...themes,
      {
        label: "",
        weight: 0.5,
        summary: "",
        anchors: [],
        reinforcedBy: [],
      },
    ]);
  }

  return (
    <Section title="Themes" hint="What stories resonate with you and why">
      <ul className="space-y-3">
        {themes.map((t, i) => {
          // Legacy themes only have `evidence`. Surface it as the initial
          // summary value so users can refine instead of losing it on save.
          const summary =
            t.summary && t.summary.trim() ? t.summary : t.evidence ?? "";
          const anchors = t.anchors ?? [];
          const reinforcedBy = t.reinforcedBy ?? [];
          return (
            <li
              key={i}
              className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Theme label (e.g. earned transformation under pressure)"
                  className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm font-medium focus:border-neutral-500 focus:outline-none"
                />
                <RemoveButton onClick={() => remove(i)} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">Weight</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={t.weight}
                  onChange={(e) =>
                    update(i, { weight: Number(e.target.value) })
                  }
                  className="flex-1 accent-emerald-500"
                />
                <span className="w-10 text-right text-xs text-neutral-400">
                  {Math.round(t.weight * 100)}%
                </span>
              </div>
              <textarea
                value={summary}
                onChange={(e) =>
                  update(i, { summary: e.target.value, evidence: "" })
                }
                placeholder="One sentence: what does this theme capture and why does it land for you?"
                rows={2}
                className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-300 focus:border-neutral-500 focus:outline-none"
              />
              <TitleRefListEditor
                label="Anchors"
                hint="The 1-4 works that crystallize this theme"
                items={anchors}
                onChange={(next) => update(i, { anchors: next })}
              />
              <TitleRefListEditor
                label="Reinforced by"
                hint="Supporting works, not the primary anchors"
                items={reinforcedBy}
                onChange={(next) => update(i, { reinforcedBy: next })}
              />
            </li>
          );
        })}
      </ul>
      <AddButton onClick={add} label="Add theme" />
    </Section>
  );
}

function TitleRefListEditor({
  label,
  hint,
  items,
  onChange,
}: {
  label: string;
  hint: string;
  items: TitleRef[];
  onChange: (next: TitleRef[]) => void;
}) {
  function updateAt(idx: number, patch: Partial<TitleRef>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeAt(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...items, { title: "", mediaType: "movie" }]);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className="text-[10px] text-neutral-600">· {hint}</span>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={it.title}
                onChange={(e) => updateAt(i, { title: e.target.value })}
                placeholder="Title"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none"
              />
              <select
                value={it.mediaType}
                onChange={(e) =>
                  updateAt(i, { mediaType: e.target.value as MediaType })
                }
                className="rounded-md border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs focus:border-neutral-500 focus:outline-none"
              >
                {MEDIA_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {MEDIA_LABEL[m]}
                  </option>
                ))}
              </select>
              <RemoveButton onClick={() => removeAt(i)} />
            </li>
          ))}
        </ul>
      )}
      <AddButton onClick={addRow} label="Add" />
    </div>
  );
}
