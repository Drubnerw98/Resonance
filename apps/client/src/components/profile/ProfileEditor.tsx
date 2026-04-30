import { useState, type KeyboardEvent } from "react";
import type {
  Complexity,
  MediaAffinity,
  MediaType,
  Pacing,
  TasteArchetype,
  TasteProfile,
  TasteTheme,
} from "@resonance/shared";

interface Props {
  initial: TasteProfile;
  onSave: (profile: TasteProfile) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

const FORMAT_ORDER: MediaType[] = ["movie", "tv", "anime", "manga", "game", "book"];

const PACING_OPTIONS: Pacing[] = ["slow-burn", "propulsive", "variable"];
const COMPLEXITY_OPTIONS: Complexity[] = ["layered", "focused", "epic"];

/**
 * Form for direct editing of every field on the TasteProfile. The user's
 * escape hatch when the AI gets something wrong — bad theme labels, weight
 * miscalibrations, missed dislikedTitles, etc.
 *
 * Local-only state until Save: the form mutates a working copy of the
 * profile, only PUTting on submit. Cancel discards. Validation happens on
 * the server (via TasteProfileSchema), which mirrors what the extraction
 * path uses, so anything that's valid for AI output is valid here too.
 */
export function ProfileEditor({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: Props) {
  const [profile, setProfile] = useState<TasteProfile>(() => clone(initial));

  function setField<K extends keyof TasteProfile>(
    key: K,
    value: TasteProfile[K],
  ) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit your taste DNA</h1>
          <p className="text-sm text-neutral-500">
            Anything the AI got wrong — fix it here. Saving creates a new
            profile version.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSave(profile)}
            disabled={isSaving}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </pre>
      )}

      <ThemesEditor
        themes={profile.themes}
        onChange={(themes) => setField("themes", themes)}
      />
      <ArchetypesEditor
        archetypes={profile.archetypes}
        onChange={(archetypes) => setField("archetypes", archetypes)}
      />
      <NarrativePrefsEditor
        prefs={profile.narrativePrefs}
        onChange={(narrativePrefs) => setField("narrativePrefs", narrativePrefs)}
      />
      <MediaAffinitiesEditor
        affinities={profile.mediaAffinities}
        onChange={(mediaAffinities) =>
          setField("mediaAffinities", mediaAffinities)
        }
      />
      <ChipListEditor
        title="Avoidances"
        hint="Patterns you bounce off — describe by pattern, not specific titles"
        placeholder="e.g. generic chosen-one plots"
        items={profile.avoidances}
        onChange={(avoidances) => setField("avoidances", avoidances)}
      />
      <ChipListEditor
        title="Disliked titles"
        hint="Specific works to keep out of recommendations entirely"
        placeholder="e.g. The Name of the Wind"
        items={profile.dislikedTitles ?? []}
        onChange={(dislikedTitles) => setField("dislikedTitles", dislikedTitles)}
      />
    </div>
  );
}

function ThemesEditor({
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
      { label: "", weight: 0.5, evidence: "" },
    ]);
  }

  return (
    <Section
      title="Themes"
      hint="What stories resonate with you and why"
    >
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

function ArchetypesEditor({
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
              placeholder="Why this resonates — 1 sentence"
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

function NarrativePrefsEditor({
  prefs,
  onChange,
}: {
  prefs: TasteProfile["narrativePrefs"];
  onChange: (next: TasteProfile["narrativePrefs"]) => void;
}) {
  return (
    <Section
      title="Narrative preferences"
      hint="The shape of stories that fit"
    >
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
            placeholder='e.g. ambiguous over neat'
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </Labeled>
      </div>
    </Section>
  );
}

function MediaAffinitiesEditor({
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
      affinities.map((a) =>
        a.format === format ? { ...a, ...patch } : a,
      ),
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

function ChipListEditor({
  title,
  hint,
  placeholder,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Section title={title} hint={hint}>
      <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
        <ChipList
          items={items}
          placeholder={placeholder}
          onChange={onChange}
          tone="rose"
        />
      </div>
    </Section>
  );
}

/**
 * Reusable add/remove chip control. Used both as a standalone field and as
 * a child of ChipListEditor / NarrativePrefsEditor / MediaAffinitiesEditor.
 */
function ChipList({
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

function Section({
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

function Labeled({
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

function RemoveButton({ onClick }: { onClick: () => void }) {
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

function AddButton({
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

/** Deep clone the profile so the editor's local mutations don't bleed into
 * the parent's state until Save fires. structuredClone avoids manually
 * spreading every nested array. */
function clone(p: TasteProfile): TasteProfile {
  return structuredClone(p);
}
