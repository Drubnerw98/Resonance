import type { TasteProfile } from "@resonance/shared";
import { PageHeader } from "../shared/PageHeader.tsx";

interface Props {
  profile: TasteProfile;
  version: number;
  updatedAt: string;
  onRefine?: () => void;
  onContinueOnboarding?: () => void;
  isRefining?: boolean;
  isStartingSession?: boolean;
}

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

// Color per format — same palette used on the Browse page format chips
// and the home dashboard's library bar. Distinct hues make the affinities
// scannable at a glance instead of all-emerald.
const FORMAT_BAR_COLOR: Record<string, string> = {
  movie: "bg-rose-600",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-600",
  manga: "bg-violet-600",
  game: "bg-emerald-600",
  book: "bg-sky-600",
};

function WeightBar({
  value,
  colorClass = "bg-emerald-500",
}: {
  value: number;
  colorClass?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-800">
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Accent palette per theme — left-border + bar use the same hue family so
// each theme reads as its own visual entity rather than three identical
// progress bars stacked.
const THEME_ACCENTS: { border: string; bar: string }[] = [
  { border: "border-l-emerald-500", bar: "bg-emerald-500" },
  { border: "border-l-teal-500", bar: "bg-teal-500" },
  { border: "border-l-amber-500", bar: "bg-amber-500" },
  { border: "border-l-rose-500", bar: "bg-rose-500" },
  { border: "border-l-sky-500", bar: "bg-sky-500" },
  { border: "border-l-fuchsia-500", bar: "bg-fuchsia-500" },
];

/** Best-effort relative-time string — "just now", "2 hours ago", "3 days
 * ago", or fallback to a short locale date for older timestamps. */
function humanizeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProfileView({
  profile,
  version,
  updatedAt,
  onRefine,
  onContinueOnboarding,
  isRefining,
  isStartingSession,
}: Props) {
  // Friendlier wording than "Version N · updated TIMESTAMP". Treats the
  // version as a count of refinements (which is what it actually is —
  // every save bumps it by one) and surfaces the timestamp as a human
  // relative-time descriptor.
  const refinedCount = version - 1; // version 1 = initial extraction, 0 refinements
  const updatedRelative = humanizeAge(updatedAt);
  const subtitle =
    refinedCount === 0
      ? `Initial extraction · ${updatedRelative}`
      : `Refined ${refinedCount}${refinedCount === 1 ? " time" : " times"} · last updated ${updatedRelative}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your taste DNA"
        subtitle={subtitle}
        action={
          (onContinueOnboarding || onRefine) && (
            <div className="flex flex-wrap gap-2">
              {onContinueOnboarding && (
                <button
                  onClick={onContinueOnboarding}
                  disabled={isStartingSession}
                  className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Start a new onboarding chat to add nuance to your profile"
                >
                  {isStartingSession ? "Starting…" : "Continue onboarding"}
                </button>
              )}
              {onRefine && (
                <button
                  onClick={onRefine}
                  disabled={isRefining}
                  className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Re-run profile extraction using your recent feedback"
                >
                  {isRefining ? "Refining…" : "Refine from feedback"}
                </button>
              )}
            </div>
          )
        }
      />

      <Section title="Themes" hint="What stories resonate with you and why">
        <ul className="space-y-3">
          {profile.themes.map((t, i) => {
            const accent = THEME_ACCENTS[i % THEME_ACCENTS.length]!;
            return (
              <li
                key={i}
                className={`rounded-md border border-l-4 border-neutral-800 bg-neutral-900 p-3 ${accent.border}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{t.label}</span>
                  <WeightBar value={t.weight} colorClass={accent.bar} />
                </div>
                <p className="mt-1 text-sm text-neutral-400">{t.evidence}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Archetypes" hint="Character types you're drawn to">
        <ul className="space-y-3">
          {profile.archetypes.map((a, i) => (
            <li
              key={i}
              className="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <p className="font-medium">{a.label}</p>
              <p className="mt-1 text-sm text-neutral-400">{a.attraction}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Narrative preferences"
        hint="The shape of stories that fit"
      >
        <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <NarrativePill label="Pacing">
            <span className="rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-0.5 text-xs text-emerald-200">
              {profile.narrativePrefs.pacing}
            </span>
          </NarrativePill>
          <NarrativePill label="Complexity">
            <span className="rounded-full border border-sky-900/50 bg-sky-950/30 px-2.5 py-0.5 text-xs text-sky-200">
              {profile.narrativePrefs.complexity}
            </span>
          </NarrativePill>
          <NarrativePill label="Tone">
            <div className="flex flex-wrap gap-1.5">
              {profile.narrativePrefs.tone.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full border border-amber-900/50 bg-amber-950/30 px-2.5 py-0.5 text-xs text-amber-200"
                >
                  {t}
                </span>
              ))}
            </div>
          </NarrativePill>
          <NarrativePill label="Endings">
            <span className="text-sm text-neutral-200">
              {profile.narrativePrefs.endings}
            </span>
          </NarrativePill>
        </div>
      </Section>

      <Section title="Media affinities" hint="Formats you've engaged with">
        <ul className="space-y-2">
          {profile.mediaAffinities.map((m, i) => (
            <li
              key={i}
              className="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className={`h-2 w-2 rounded-full ${FORMAT_BAR_COLOR[m.format] ?? "bg-emerald-500"}`}
                    aria-hidden
                  />
                  {FORMAT_LABEL[m.format] ?? m.format}
                </span>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>comfort</span>
                  <WeightBar
                    value={m.comfort}
                    colorClass={FORMAT_BAR_COLOR[m.format] ?? "bg-emerald-500"}
                  />
                </div>
              </div>
              {m.favorites.length > 0 && (
                <p className="mt-1 text-sm text-neutral-400">
                  {m.favorites.join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Avoidances" hint="Patterns you bounce off">
        {profile.avoidances.length === 0 ? (
          <p className="text-sm text-neutral-500">None recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {profile.avoidances.map((a, i) => (
              <li
                key={i}
                className="rounded-full border border-rose-900 bg-rose-950/40 px-3 py-1 text-sm text-rose-200"
              >
                {a}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Disliked titles"
        hint="Specific works you've told us not to recommend"
      >
        {(profile.dislikedTitles ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">None recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(profile.dislikedTitles ?? []).map((t, i) => (
              <li
                key={i}
                className="rounded-full border border-rose-900 bg-rose-950/40 px-3 py-1 text-sm text-rose-200"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </Section>
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

function NarrativePill({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
