import type { TasteProfile } from "@resonance/shared";

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

function WeightBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-800">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
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
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 border-b border-neutral-800 pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your taste DNA</h1>
          <p className="text-sm text-neutral-500">
            Version {version} · updated{" "}
            {new Date(updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onContinueOnboarding && (
            <button
              onClick={onContinueOnboarding}
              disabled={isStartingSession}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              title="Start a new onboarding chat to add nuance to your profile"
            >
              {isStartingSession ? "Starting…" : "Continue onboarding"}
            </button>
          )}
          {onRefine && (
            <button
              onClick={onRefine}
              disabled={isRefining}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              title="Re-run profile extraction using your recent feedback"
            >
              {isRefining ? "Refining…" : "Refine from feedback"}
            </button>
          )}
        </div>
      </header>

      <Section title="Themes" hint="What stories resonate with you and why">
        <ul className="space-y-3">
          {profile.themes.map((t, i) => (
            <li
              key={i}
              className="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{t.label}</span>
                <WeightBar value={t.weight} />
              </div>
              <p className="mt-1 text-sm text-neutral-400">{t.evidence}</p>
            </li>
          ))}
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

      <Section title="Narrative preferences" hint="The shape of stories that fit">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-neutral-500">Pacing</dt>
          <dd>{profile.narrativePrefs.pacing}</dd>
          <dt className="text-neutral-500">Complexity</dt>
          <dd>{profile.narrativePrefs.complexity}</dd>
          <dt className="text-neutral-500">Tone</dt>
          <dd>{profile.narrativePrefs.tone.join(", ")}</dd>
          <dt className="text-neutral-500">Endings</dt>
          <dd>{profile.narrativePrefs.endings}</dd>
        </dl>
      </Section>

      <Section title="Media affinities" hint="Formats you've engaged with">
        <ul className="space-y-2">
          {profile.mediaAffinities.map((m, i) => (
            <li
              key={i}
              className="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">
                  {FORMAT_LABEL[m.format] ?? m.format}
                </span>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>comfort</span>
                  <WeightBar value={m.comfort} />
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
