import type { Complexity, Pacing, TasteProfile } from "@resonance/shared";
import { ChipList, Labeled, Section } from "./primitives.tsx";

const PACING_OPTIONS: Pacing[] = ["slow-burn", "propulsive", "variable"];
const COMPLEXITY_OPTIONS: Complexity[] = ["layered", "focused", "epic"];

export function NarrativePrefsEditor({
  prefs,
  onChange,
}: {
  prefs: TasteProfile["narrativePrefs"];
  onChange: (next: TasteProfile["narrativePrefs"]) => void;
}) {
  return (
    <Section title="Narrative preferences" hint="The shape of stories that fit">
      <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Pacing">
            <select
              value={prefs.pacing}
              onChange={(e) =>
                onChange({ ...prefs, pacing: e.target.value as Pacing })
              }
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
            >
              {PACING_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Complexity">
            <select
              value={prefs.complexity}
              onChange={(e) =>
                onChange({
                  ...prefs,
                  complexity: e.target.value as Complexity,
                })
              }
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
            >
              {COMPLEXITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        <Labeled label="Tone">
          <ChipList
            items={prefs.tone}
            placeholder="e.g. bittersweet, quietly absurd"
            onChange={(tone) => onChange({ ...prefs, tone })}
          />
        </Labeled>

        <Labeled label="Endings">
          <input
            type="text"
            value={prefs.endings}
            onChange={(e) => onChange({ ...prefs, endings: e.target.value })}
            placeholder="e.g. ambiguous over neat"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </Labeled>
      </div>
    </Section>
  );
}
