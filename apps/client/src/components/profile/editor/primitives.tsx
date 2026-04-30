import { useState, type KeyboardEvent } from "react";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-500 hover:border-rose-900 hover:text-rose-400"
      aria-label="Remove"
      title="Remove"
    >
      ×
    </button>
  );
}

export function AddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-dashed border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
    >
      + {label}
    </button>
  );
}

/**
 * Reusable add/remove chip control. Used both as a standalone field and as
 * a child of ChipListEditor / NarrativePrefsEditor / MediaAffinitiesEditor.
 */
export function ChipList({
  items,
  placeholder,
  onChange,
  tone = "neutral",
}: {
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  tone?: "neutral" | "rose";
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && items.length > 0) {
      // Convenience: backspace on an empty input pops the last chip
      onChange(items.slice(0, -1));
    }
  }

  const chipClass =
    tone === "rose"
      ? "rounded-full border border-rose-900 bg-rose-950/40 px-3 py-1 text-sm text-rose-200"
      : "rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-sm text-neutral-200";

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <li key={i} className={`${chipClass} flex items-center gap-2`}>
              <span>{it}</span>
              <button
                onClick={() => remove(i)}
                className="text-current opacity-60 hover:opacity-100"
                aria-label={`Remove ${it}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <button
          onClick={commit}
          disabled={!draft.trim()}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
