import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { FormatGlyph } from "../components/shared/FormatGlyph.tsx";
import { Artwork } from "../components/shared/Artwork.tsx";
import { ThemeRow } from "../components/shared/ThemeRow.tsx";
import { formatBatchDate } from "../lib/formatDate.ts";
import snapshot from "../demo/snapshot.json";

/**
 * Public, read-only showcase of a real taste profile — the repo author's
 * own (already publicly showcased via Constellation's /demo; the snapshot
 * is content-only, no ids or emails). No auth, no API calls: the data is a
 * static JSON snapshot baked into the bundle by
 * apps/server/scripts/export-demo-snapshot.ts. The point is to let a
 * signed-out visitor see what a mature profile + a grounded batch actually
 * look like before committing to onboarding.
 *
 * Visual treatment mirrors /profile's dossier (ProfileView): numbered
 * sections, editorial hairlines, Newsreader display labels, per-theme
 * accent bars. Small local components rather than reusing ProfileView —
 * that component is wired for a live profile (refine actions, versioning).
 */

const FORMAT_LABEL: Record<string, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

// Same per-format palette as ProfileView / the watchlist.
const FORMAT_BAR_COLOR: Record<string, string> = {
  movie: "bg-rose-600",
  tv: "bg-amber-500",
  anime: "bg-fuchsia-600",
  manga: "bg-violet-600",
  game: "bg-emerald-600",
  book: "bg-sky-600",
};

const FORMAT_TEXT_COLOR: Record<string, string> = {
  movie: "text-rose-500",
  tv: "text-amber-400",
  anime: "text-fuchsia-500",
  manga: "text-violet-500",
  game: "text-emerald-500",
  book: "text-sky-500",
};

// Same rotation ProfileView uses for its theme entries.
const THEME_ACCENTS: string[] = [
  "bg-emerald-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-fuchsia-500",
];

const FORMAT_ORDER: MediaType[] = [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
];

// A cold visitor reads three themes, not eight. Full dossier treatment
// for the strongest; the tail renders as compact rows so the batch
// section (the payoff) stays within reach of one scroll.
const FULL_THEME_COUNT = 3;

export function DemoPage() {
  const { themes, batch, libraryCounts, libraryTotal } = snapshot;
  const maxCount = Math.max(...Object.values(libraryCounts), 1);
  const fullThemes = themes.slice(0, FULL_THEME_COUNT);
  const restThemes = themes.slice(FULL_THEME_COUNT);

  return (
    <div className="space-y-14 pb-10 sm:space-y-16">
      {/* Read-only banner — first thing on the page so nobody mistakes the
          dossier below for their own. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-neutral-200">
          <span className="editorial-eyebrow mr-3">Live demo</span>A real taste
          profile, read-only — sign up to build yours.
        </p>
        <Link
          to="/sign-up"
          className="group inline-flex items-baseline gap-2 text-[13px] text-neutral-50"
        >
          <span className="border-b border-emerald-500/50 pb-0.5 transition-colors group-hover:border-emerald-300">
            Start the conversation
          </span>
          <span aria-hidden className="text-emerald-300/80">
            →
          </span>
        </Link>
      </div>

      <PageHeader
        eyebrow="Dossier"
        title="One reader's taste DNA"
        subtitle={`Extracted from a ${libraryTotal.toLocaleString()}-item library and a long onboarding conversation. Every theme is anchored in works the reader actually named.`}
      />

      <Section n={1} title="Themes" hint="What stories resonate, and why">
        <ul className="space-y-10">
          {fullThemes.map((t, i) => (
            <li key={i} className="editorial-hairline space-y-4 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-xl font-medium leading-tight text-neutral-50 sm:text-2xl">
                  {t.label}
                </h3>
                <WeightBar
                  value={t.weight}
                  colorClass={THEME_ACCENTS[i % THEME_ACCENTS.length]!}
                />
              </div>
              {t.summary && (
                <p className="max-w-2xl text-[15px] leading-relaxed text-neutral-300">
                  {t.summary}
                </p>
              )}
              {t.anchors.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                  <span className="editorial-eyebrow shrink-0">
                    Anchored in
                  </span>
                  <ul className="flex flex-wrap gap-1.5">
                    {t.anchors.map((a, j) => (
                      <li
                        key={j}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/35 bg-emerald-950/15 px-2.5 py-0.5 text-[12px] text-neutral-100"
                      >
                        <FormatGlyph
                          format={a.mediaType}
                          size={10}
                          className="opacity-70"
                        />
                        <span>{a.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>

        {restThemes.length > 0 && (
          <div className="editorial-hairline mt-10 space-y-4 pt-6">
            <p className="editorial-eyebrow">
              …and {restThemes.length} more signals
            </p>
            <ul className="space-y-3">
              {restThemes.map((t, i) => (
                <li key={i}>
                  <ThemeRow
                    label={t.label}
                    weight={t.weight}
                    colorClass={
                      THEME_ACCENTS[
                        (i + FULL_THEME_COUNT) % THEME_ACCENTS.length
                      ]!
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        n={2}
        title="A real batch"
        hint="One prompt, answered from the profile above"
      >
        <div className="editorial-hairline space-y-3 pt-6">
          {batch.prompt && (
            <>
              <p className="editorial-eyebrow">They typed</p>
              <p className="font-display max-w-[36ch] text-2xl italic leading-snug text-neutral-50 sm:text-3xl">
                &ldquo;{batch.prompt}&rdquo;
              </p>
            </>
          )}
          <p className="text-xs text-neutral-500">
            {formatBatchDate(batch.createdAt)} · {batch.picks.length}{" "}
            {batch.picks.length === 1 ? "pick" : "picks"} · every title
            verified against real metadata
          </p>
        </div>
        <div className="mt-8 space-y-10">
          {batch.picks.map((pick, i) => (
            <article
              key={i}
              className="editorial-hairline flex gap-5 pt-6 sm:gap-7"
            >
              <Artwork
                url={pick.artworkUrl}
                title={pick.title}
                mediaType={pick.mediaType}
                className="h-32 w-24 flex-shrink-0 rounded-sm object-cover sm:h-44 sm:w-32"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <header className="min-w-0 space-y-1.5">
                    <div className="editorial-eyebrow flex flex-wrap items-baseline gap-x-1.5">
                      <span>
                        {FORMAT_LABEL[pick.mediaType] ?? pick.mediaType}
                      </span>
                      {pick.year && <span>· {pick.year}</span>}
                    </div>
                    <h3 className="font-display text-xl font-medium leading-[1.15] tracking-tight text-neutral-50 sm:text-2xl">
                      {pick.title}
                    </h3>
                  </header>
                  <div className="shrink-0 text-right">
                    <span className="font-display text-3xl font-medium leading-none tabular-nums text-emerald-300 sm:text-4xl">
                      {Math.round(pick.matchScore * 100)}
                    </span>
                    <span className="editorial-eyebrow ml-1 text-emerald-300/60">
                      match
                    </span>
                  </div>
                </div>
                <p className="text-[14px] leading-relaxed text-neutral-300 sm:text-[15px]">
                  {pick.explanation}
                </p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        n={3}
        title="The library behind it"
        hint="Imports and feedback the recommender cross-references"
      >
        <ul className="editorial-hairline space-y-5 pt-6">
          {FORMAT_ORDER.flatMap((format) => {
            const n = (libraryCounts as Record<string, number>)[format];
            if (!n) return [];
            return [
              <li key={format} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2.5 font-display text-lg font-medium text-neutral-50">
                    <FormatGlyph
                      format={format}
                      size={14}
                      className={
                        FORMAT_TEXT_COLOR[format] ?? "text-emerald-500"
                      }
                    />
                    {FORMAT_LABEL[format]}
                  </span>
                  <span className="font-display text-sm tabular-nums text-neutral-400">
                    {n.toLocaleString()}
                  </span>
                </div>
                <div className="h-px w-full bg-neutral-800">
                  <div
                    className={`h-full ${FORMAT_BAR_COLOR[format] ?? "bg-emerald-500"}`}
                    style={{
                      width: `${Math.max(1, Math.round((n / maxCount) * 100))}%`,
                    }}
                  />
                </div>
              </li>,
            ];
          })}
        </ul>
      </Section>

      {/* Closing CTA — same editorial text-link treatment as the landing
          page so the demo reads as part of the same publication. */}
      <section className="space-y-6 pt-4">
        <h2 className="font-display max-w-[24ch] text-2xl font-normal leading-tight tracking-tight text-neutral-50 sm:text-4xl">
          Yours would look{" "}
          <em className="font-normal italic text-emerald-300/95">nothing</em>{" "}
          like this.
        </h2>
        <p className="max-w-xl text-[15px] leading-relaxed text-neutral-300">
          That&apos;s the point. The first conversation takes about five
          minutes; the profile it produces is yours to edit, evolve, and argue
          with.
        </p>
        <Link
          to="/sign-up"
          className="group inline-flex items-baseline gap-2.5 text-[15px] text-neutral-50"
        >
          <span className="border-b border-neutral-500 pb-1 transition-colors group-hover:border-neutral-100">
            Build your own
          </span>
          <span aria-hidden className="text-emerald-300/80">
            →
          </span>
        </Link>
      </section>
    </div>
  );
}

/** Numbered dossier section — same markup as ProfileView's Section. */
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
    <section className="space-y-5">
      <div className="flex items-baseline gap-4">
        <span
          className="editorial-numeral block text-3xl leading-none font-normal text-emerald-300/30 sm:text-4xl"
          aria-hidden
        >
          {n.toString().padStart(2, "0")}
        </span>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium leading-tight tracking-tight text-neutral-50 sm:text-3xl">
            {title}
          </h2>
          <p className="text-[13px] italic text-neutral-500">{hint}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Same weight readout ProfileView renders next to each theme label. */
function WeightBar({
  value,
  colorClass,
}: {
  value: number;
  colorClass: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-baseline gap-2">
      <div className="h-px w-24 bg-neutral-800 sm:w-32">
        <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-display text-sm tabular-nums text-neutral-500">
        {pct}
      </span>
    </div>
  );
}
