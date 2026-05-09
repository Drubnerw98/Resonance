import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  FAST_TONE_OPTIONS,
  type Complexity,
  type FastOnboardingFormInput,
  type FastTone,
  type MediaType,
  type Pacing,
} from "@resonance/shared";
import { useFastOnboarding } from "../../hooks/useFastOnboarding.ts";

const FORMATS: { value: MediaType; label: string }[] = [
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "game", label: "Games" },
  { value: "book", label: "Books" },
];

const PACING_CHOICES: {
  value: Pacing;
  label: string;
  examples: string;
}[] = [
  {
    value: "slow-burn",
    label: "Slow-burn that earns it",
    examples: "Severance, The Sopranos, Disco Elysium",
  },
  {
    value: "propulsive",
    label: "Propulsive, won't-let-you-go",
    examples: "Mission Impossible, John Wick, Edge of Tomorrow",
  },
  {
    value: "variable",
    label: "Honestly both, depends on mood",
    examples: "I shift between modes",
  },
];

const COMPLEXITY_CHOICES: {
  value: Complexity;
  label: string;
  examples: string;
}[] = [
  {
    value: "layered",
    label: "Layered, rewards re-watching",
    examples: "Tinker Tailor, Annihilation, Pathologic",
  },
  {
    value: "focused",
    label: "Focused, does one thing exceptionally",
    examples: "Whiplash, Locke, Hades",
  },
  {
    value: "epic",
    label: "Big and epic, sweeps you up",
    examples: "LotR, Dune, Mass Effect",
  },
];

const ENDINGS_SUGGESTIONS = [
  "Ambiguous over neat",
  "Earned catharsis",
  "Bittersweet quiet",
  "Pyrrhic",
  "Triumphant",
];

const AVOIDANCE_SUGGESTIONS = [
  "Chosen-one plots",
  "Tidy moral resolutions",
  "Fan-service that breaks tone",
  "Twee whimsy",
  "Grimdark for the sake of it",
  "Romance as the engine",
];

interface FormState {
  titles: Record<MediaType, string[]>;
  activeFormat: MediaType;
  pacing: Pacing | null;
  complexity: Complexity | null;
  tone: FastTone[];
  endings: string;
  avoidancePatterns: string[];
  dislikedTitles: string[];
  // Format toggles persist independently of titles so a user who removes all
  // titles in a format doesn't have the toggle silently flip off underneath.
  enabledFormats: Record<MediaType, boolean>;
}

function initialState(): FormState {
  return {
    titles: {
      movie: [],
      tv: [],
      anime: [],
      manga: [],
      game: [],
      book: [],
    },
    activeFormat: "movie",
    pacing: null,
    complexity: null,
    tone: [],
    endings: "",
    avoidancePatterns: [],
    dislikedTitles: [],
    enabledFormats: {
      movie: true,
      tv: true,
      anime: false,
      manga: false,
      game: true,
      book: true,
    },
  };
}

export function FastForm() {
  const navigate = useNavigate();
  const { submit, submitting, error } = useFastOnboarding();
  const [state, setState] = useState<FormState>(initialState);

  // Auto-enable a format the moment the user adds the first title in it. The
  // inverse is NOT true: removing all titles doesn't disable, since the user
  // may still want recs in that format.
  function setTitlesForFormat(format: MediaType, titles: string[]): void {
    setState((s) => ({
      ...s,
      titles: { ...s.titles, [format]: titles },
      enabledFormats:
        titles.length > 0 && !s.enabledFormats[format]
          ? { ...s.enabledFormats, [format]: true }
          : s.enabledFormats,
    }));
  }

  const totalTitles = useMemo(
    () => Object.values(state.titles).reduce((n, arr) => n + arr.length, 0),
    [state.titles],
  );

  const formatsWithTitles = useMemo(
    () =>
      FORMATS.filter((f) => state.titles[f.value].length > 0).map((f) => f.value),
    [state.titles],
  );

  const enabledFormatList = useMemo(
    () =>
      FORMATS.map((f) => f.value).filter((v) => state.enabledFormats[v]),
    [state.enabledFormats],
  );

  const canSubmit =
    totalTitles >= 4 &&
    state.pacing !== null &&
    state.complexity !== null &&
    state.tone.length >= 1 &&
    enabledFormatList.length >= 1 &&
    !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !state.pacing || !state.complexity) return;

    const payload: FastOnboardingFormInput = {
      titles: FORMATS.map((f) => ({
        format: f.value,
        titles: state.titles[f.value],
      })).filter((g) => g.titles.length > 0),
      pacing: state.pacing,
      complexity: state.complexity,
      tone: state.tone,
      endings: state.endings.trim(),
      avoidancePatterns: state.avoidancePatterns,
      dislikedTitles: state.dislikedTitles,
      enabledFormats: enabledFormatList,
    };

    try {
      await submit(payload);
      navigate("/recommendations");
    } catch {
      // Error is set in the hook; stay on the page so the user can retry.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Section 1 — Titles */}
      <FormSection
        eyebrow="1 / 4"
        title="What stuck with you"
        subtitle="Drop in titles you've genuinely loved. The more you list, the better the profile. Aim for at least 4 across any formats."
      >
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => {
            const count = state.titles[f.value].length;
            const isActive = state.activeFormat === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, activeFormat: f.value }))
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] text-neutral-500">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ChipsField
          placeholder={`Add a ${labelOf(state.activeFormat).toLowerCase()} title…`}
          values={state.titles[state.activeFormat]}
          onChange={(next) => setTitlesForFormat(state.activeFormat, next)}
        />

        <p className="text-xs text-neutral-500">
          {totalTitles}/4 minimum
          {totalTitles >= 4 && formatsWithTitles.length === 1 && (
            <span className="ml-2 text-amber-400/80">
              · Adding titles from another format makes recs much sharper
            </span>
          )}
        </p>
      </FormSection>

      {/* Section 2 — Narrative shape */}
      <FormSection
        eyebrow="2 / 4"
        title="What kind of stories"
        subtitle="Pick the closer one in each pair — no wrong answer."
      >
        <ChoiceGroup
          label="Pacing"
          choices={PACING_CHOICES}
          value={state.pacing}
          onChange={(v) => setState((s) => ({ ...s, pacing: v }))}
        />

        <ChoiceGroup
          label="Complexity"
          choices={COMPLEXITY_CHOICES}
          value={state.complexity}
          onChange={(v) => setState((s) => ({ ...s, complexity: v }))}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">
            Tone <span className="text-xs text-neutral-500">— pick 1–3</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {FAST_TONE_OPTIONS.map((tone) => {
              const selected = state.tone.includes(tone);
              const atCap = state.tone.length >= 3 && !selected;
              return (
                <button
                  key={tone}
                  type="button"
                  disabled={atCap}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      tone: selected
                        ? s.tone.filter((t) => t !== tone)
                        : [...s.tone, tone],
                    }))
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                      : atCap
                        ? "cursor-not-allowed border-neutral-800 bg-neutral-950 text-neutral-600"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {tone}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">
            Endings <span className="text-xs text-neutral-500">— optional</span>
          </label>
          <input
            type="text"
            value={state.endings}
            onChange={(e) =>
              setState((s) => ({ ...s, endings: e.target.value }))
            }
            placeholder="How do you feel about endings?"
            maxLength={280}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {ENDINGS_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    endings: s.endings ? `${s.endings}, ${sug}` : sug,
                  }))
                }
                className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>
      </FormSection>

      {/* Section 3 — Avoidances */}
      <FormSection
        eyebrow="3 / 4"
        title="Things you bounce off"
        subtitle="Optional but improves recs a lot — this is the channel that keeps the system from rec'ing things adjacent to what you hated."
      >
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">
            Patterns
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AVOIDANCE_SUGGESTIONS.map((sug) => {
              const selected = state.avoidancePatterns.includes(sug);
              return (
                <button
                  key={sug}
                  type="button"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      avoidancePatterns: selected
                        ? s.avoidancePatterns.filter((p) => p !== sug)
                        : [...s.avoidancePatterns, sug],
                    }))
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? "border-red-500/70 bg-red-500/10 text-red-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {selected ? "✓ " : "+ "}
                  {sug}
                </button>
              );
            })}
          </div>
          <ChipsField
            placeholder="Add your own pattern…"
            values={state.avoidancePatterns.filter(
              (p) => !AVOIDANCE_SUGGESTIONS.includes(p),
            )}
            onChange={(custom) =>
              setState((s) => ({
                ...s,
                avoidancePatterns: [
                  ...s.avoidancePatterns.filter((p) =>
                    AVOIDANCE_SUGGESTIONS.includes(p),
                  ),
                  ...custom,
                ],
              }))
            }
            chipTone="red"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">
            Specific titles that didn't land
          </label>
          <ChipsField
            placeholder="Add a title…"
            values={state.dislikedTitles}
            onChange={(next) =>
              setState((s) => ({ ...s, dislikedTitles: next }))
            }
            chipTone="red"
          />
        </div>
      </FormSection>

      {/* Section 4 — Format toggles */}
      <FormSection
        eyebrow="4 / 4"
        title="Where should we look"
        subtitle="We'll only recommend in formats you turn on. Adding titles auto-enables a format; you can override here."
      >
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => {
            const enabled = state.enabledFormats[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    enabledFormats: {
                      ...s.enabledFormats,
                      [f.value]: !enabled,
                    },
                  }))
                }
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  enabled
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
                }`}
              >
                {enabled ? "✓ " : "  "}
                {f.label}
              </button>
            );
          })}
        </div>
      </FormSection>

      {error && (
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </pre>
      )}

      <div className="flex flex-col items-end gap-2 border-t border-neutral-800 pt-6">
        {!canSubmit && !submitting && (
          <p className="text-xs text-neutral-500">
            {totalTitles < 4
              ? `Add ${4 - totalTitles} more title${4 - totalTitles === 1 ? "" : "s"} to continue`
              : !state.pacing
                ? "Pick a pacing preference"
                : !state.complexity
                  ? "Pick a complexity preference"
                  : state.tone.length === 0
                    ? "Pick at least one tone"
                    : enabledFormatList.length === 0
                      ? "Enable at least one format"
                      : null}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
        >
          {submitting ? "Reading your taste…" : "Build my profile  →"}
        </button>
      </div>
    </form>
  );
}

// === Local building blocks ===

interface FormSectionProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function FormSection({ eyebrow, title, subtitle, children }: FormSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          {eyebrow}
        </p>
        <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
        <p className="text-sm text-neutral-400">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface ChipsFieldProps {
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  chipTone?: "default" | "red";
}

function ChipsField({
  placeholder,
  values,
  onChange,
  chipTone = "default",
}: ChipsFieldProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  const chipClass =
    chipTone === "red"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!draft.trim()}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${chipClass}`}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="text-neutral-400 transition-colors hover:text-neutral-100"
                aria-label={`Remove ${v}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  choices: { value: T; label: string; examples: string }[];
  value: T | null;
  onChange: (v: T) => void;
}

function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-neutral-200">{label}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((c) => {
          const selected = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`rounded-md border p-3 text-left transition-colors ${
                selected
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-neutral-700 bg-neutral-900 hover:border-neutral-500"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  selected ? "text-emerald-200" : "text-neutral-100"
                }`}
              >
                {c.label}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{c.examples}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function labelOf(format: MediaType): string {
  return FORMATS.find((f) => f.value === format)?.label ?? format;
}
