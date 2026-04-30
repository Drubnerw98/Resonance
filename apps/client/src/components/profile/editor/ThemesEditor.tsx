import type { TasteTheme } from "@resonance/shared";
import { AddButton, RemoveButton, Section } from "./primitives.tsx";

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
    onChange([...themes, { label: "", weight: 0.5, evidence: "" }]);
  }

  return (
    <Section title="Themes" hint="What stories resonate with you and why">
      <ul className="space-y-3">
        {themes.map((t, i) => (
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
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-10 text-right text-xs text-neutral-400">
                {Math.round(t.weight * 100)}%
              </span>
            </div>
            <textarea
              value={t.evidence}
              onChange={(e) => update(i, { evidence: e.target.value })}
              placeholder="Evidence — titles or moments that support this theme"
              rows={2}
              className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-300 focus:border-neutral-500 focus:outline-none"
            />
          </li>
        ))}
      </ul>
      <AddButton onClick={add} label="Add theme" />
    </Section>
  );
}
