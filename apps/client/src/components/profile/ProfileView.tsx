import type { TasteProfile, TitleRef } from "@resonance/shared";
import { PageHeader } from "../shared/PageHeader.tsx";

const FORMAT_GLYPH: Record<string, string> = {
  movie: "▶",
  tv: "■",
  anime: "★",
  manga: "❒",
  game: "◆",
  book: "❡",
};

function TitleChip({
  ref_,
  tone,
}: {
  ref_: TitleRef;
  tone: "anchor" | "reinforce";
}) {
  const cls =
    tone === "anchor"
      ? "border-emerald-700/35 bg-emerald-950/15 text-neutral-100"
      : "border-neutral-800/60 bg-transparent text-neutral-400";
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] transition-colors duration-200 ${cls}`}
    >
      <span aria-hidden className="text-[10px] opacity-70">
        {FORMAT_GLYPH[ref_.mediaType] ?? "•"}
      </span>
      <span>{ref_.title}</span>
    </li>
  );
}

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
  colorClass = "bg-emerald-400/80",
}: {
  value: number;
  colorClass?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-baseline gap-2">
      <div className="h-px w-24 bg-neutral-800 sm:w-32">
        <div
          className={`h-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-display text-sm tabular-nums text-neutral-500">
        {pct}
      </span>
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
    <div className="space-y-16 sm:space-y-20">
      <PageHeader
        eyebrow="Dossier"
        title="Your taste DNA"
        subtitle={subtitle}
        action={
          (onContinueOnboarding || onRefine) && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {onContinueOnboarding && (
                <button
                  onClick={onContinueOnboarding}
                  disabled={isStartingSession}
                  className="group inline-flex items-baseline gap-2 text-[13px] text-neutral-300 transition-colors hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Start a new onboarding chat to add nuance to your profile"
                >
                  <span className="border-b border-neutral-700 pb-0.5 transition-colors group-hover:border-neutral-400">
                    {isStartingSession ? "Starting…" : "Continue onboarding"}
                  </span>
                </button>
              )}
              {onRefine && (
                <button
                  onClick={onRefine}
                  disabled={isRefining}
                  className="group inline-flex items-baseline gap-2 text-[13px] text-neutral-300 transition-colors hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Re-run profile extraction using your recent feedback"
                >
                  <span className="border-b border-emerald-500/50 pb-0.5 transition-colors group-hover:border-emerald-300">
                    {isRefining ? "Refining…" : "Refine from feedback"}
                  </span>
                </button>
              )}
            </div>
          )
        }
      />

      <Section
        n={1}
        title="Themes"
        hint="What stories resonate with you and why"
      >
        <ul className="space-y-10">
          {profile.themes.map((t, i) => {
            const accent = THEME_ACCENTS[i % THEME_ACCENTS.length]!;
            // Display summary if present; fall back to legacy evidence for
            // profiles persisted before the 2026-05-10 schema change.
            const body = t.summary && t.summary.trim()
              ? t.summary
              : t.evidence ?? "";
            const anchors = t.anchors ?? [];
            const reinforcedBy = t.reinforcedBy ?? [];
            return (
              <li key={i} className="editorial-hairline space-y-4 pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl font-medium leading-tight text-neutral-50 sm:text-2xl">
                    {t.label}
                  </h3>
                  <WeightBar value={t.weight} colorClass={accent.bar} />
                </div>
                {body && (
                  <p className="max-w-2xl text-[15px] leading-relaxed text-neutral-300">
                    {body}
                  </p>
                )}
                {(anchors.length > 0 || reinforcedBy.length > 0) && (
                  <div className="space-y-2 pt-1">
                    {anchors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="editorial-eyebrow shrink-0">
                          Anchored in
                        </span>
                        <ul className="flex flex-wrap gap-1.5">
                          {anchors.map((a, j) => (
                            <TitleChip
                              key={`anchor-${j}`}
                              ref_={a}
                              tone="anchor"
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                    {reinforcedBy.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="editorial-eyebrow shrink-0">
                          Reinforced by
                        </span>
                        <ul className="flex flex-wrap gap-1.5">
                          {reinforcedBy.map((r, j) => (
                            <TitleChip
                              key={`reinforce-${j}`}
                              ref_={r}
                              tone="reinforce"
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section n={2} title="Archetypes" hint="Character types you're drawn to">
        <ul className="space-y-8">
          {profile.archetypes.map((a, i) => (
            <li key={i} className="editorial-hairline space-y-3 pt-6">
              <h3 className="font-display text-xl font-medium leading-tight text-neutral-50 sm:text-2xl">
                {a.label}
              </h3>
              <p className="max-w-2xl text-[15px] leading-relaxed text-neutral-300">
                {a.attraction}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        n={3}
        title="Narrative preferences"
        hint="The shape of stories that fit"
      >
        <dl className="editorial-hairline grid gap-x-6 gap-y-4 pt-6 sm:grid-cols-[140px_1fr]">
          <NarrativeRow label="Pacing">
            <span className="font-display text-lg italic text-neutral-100">
              {profile.narrativePrefs.pacing}
            </span>
          </NarrativeRow>
          <NarrativeRow label="Complexity">
            <span className="font-display text-lg italic text-neutral-100">
              {profile.narrativePrefs.complexity}
            </span>
          </NarrativeRow>
          <NarrativeRow label="Tone">
            <div className="flex flex-wrap gap-1.5">
              {profile.narrativePrefs.tone.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full border border-amber-700/40 bg-amber-950/10 px-2.5 py-0.5 text-[12px] text-amber-200"
                >
                  {t}
                </span>
              ))}
            </div>
          </NarrativeRow>
          <NarrativeRow label="Endings">
            <span className="text-[15px] leading-relaxed text-neutral-200">
              {profile.narrativePrefs.endings}
            </span>
          </NarrativeRow>
        </dl>
      </Section>

      <Section n={4} title="Media affinities" hint="Formats you've engaged with">
        <ul className="space-y-6">
          {profile.mediaAffinities.map((m, i) => (
            <li key={i} className="editorial-hairline space-y-2 pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2.5 font-display text-lg font-medium text-neutral-50">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${FORMAT_BAR_COLOR[m.format] ?? "bg-emerald-500"}`}
                    aria-hidden
                  />
                  {FORMAT_LABEL[m.format] ?? m.format}
                </span>
                <WeightBar
                  value={m.comfort}
                  colorClass={FORMAT_BAR_COLOR[m.format] ?? "bg-emerald-500"}
                />
              </div>
              {m.favorites.length > 0 && (
                <p className="text-[13px] leading-relaxed text-neutral-400">
                  {m.favorites.join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section n={5} title="Avoidances" hint="Patterns you bounce off">
        {profile.avoidances.length === 0 ? (
          <p className="editorial-hairline pt-6 text-[14px] italic text-neutral-500">
            None recorded.
          </p>
        ) : (
          <div className="editorial-hairline pt-6">
            <ul className="flex flex-wrap gap-2">
              {profile.avoidances.map((a, i) => (
                <li
                  key={i}
                  className="rounded-full border border-rose-700/35 bg-rose-950/15 px-3 py-1 text-[13px] text-rose-200"
                >
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        n={6}
        title="Disliked titles"
        hint="Specific works you've told us not to recommend"
      >
        {(profile.dislikedTitles ?? []).length === 0 ? (
          <p className="editorial-hairline pt-6 text-[14px] italic text-neutral-500">
            None recorded.
          </p>
        ) : (
          <div className="editorial-hairline pt-6">
            <ul className="flex flex-wrap gap-2">
              {(profile.dislikedTitles ?? []).map((t, i) => (
                <li
                  key={i}
                  className="rounded-full border border-rose-700/35 bg-rose-950/15 px-3 py-1 text-[13px] text-rose-200"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-5 sm:grid-cols-[auto_1fr]">
      <div className="space-y-2">
        <span
          className="editorial-numeral block text-3xl leading-none font-normal text-emerald-300/30 sm:text-4xl"
          aria-hidden
        >
          {n.toString().padStart(2, "0")}
        </span>
        <h2 className="font-display text-2xl font-medium leading-tight tracking-tight text-neutral-50 sm:text-3xl">
          {title}
        </h2>
        <p className="text-[13px] italic text-neutral-500">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function NarrativeRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="editorial-eyebrow self-baseline">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
