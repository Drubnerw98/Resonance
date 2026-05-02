import type { TasteArchetype } from "@resonance/shared";
import { AddButton, RemoveButton, Section } from "./primitives.tsx";

export function ArchetypesEditor({
  archetypes,
  onChange,
}: {
  archetypes: TasteArchetype[];
  onChange: (next: TasteArchetype[]) => void;
}) {
  function update(i: number, patch: Partial<TasteArchetype>) {
    onChange(archetypes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function remove(i: number) {
    onChange(archetypes.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...archetypes, { label: "", attraction: "" }]);
  }

  return (
    <Section title="Archetypes" hint="Character types you're drawn to">
      <ul className="space-y-3">
        {archetypes.map((a, i) => (
          <li
            key={i}
            className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-3"
          >
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={a.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Archetype label (e.g. burden-carrying protagonist)"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm font-medium focus:border-neutral-500 focus:outline-none"
              />
              <RemoveButton onClick={() => remove(i)} />
            </div>
            <textarea
              value={a.attraction}
              onChange={(e) => update(i, { attraction: e.target.value })}
              placeholder="Why this resonates (one sentence)"
              rows={2}
              className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-300 focus:border-neutral-500 focus:outline-none"
            />
          </li>
        ))}
      </ul>
      <AddButton onClick={add} label="Add archetype" />
    </Section>
  );
}
