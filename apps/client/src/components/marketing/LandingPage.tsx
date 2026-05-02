import { Link } from "react-router-dom";
import { Logo } from "../shared/Logo.tsx";

/**
 * Signed-out landing page. Lives at "/" when SignedOut. Editorial-leaning
 * design: Newsreader display serif for hero + section titles, restrained
 * neutral palette with emerald reserved for the brand mark and a single
 * accent moment per section, real typographic hierarchy instead of the
 * gradient-text-on-dark template look.
 *
 * Sections (top to bottom):
 *   1. Hero - logo + serif headline + subhead + CTAs
 *   2. How it works - three-step flow with editorial numerals
 *   3. Differentiator - "not this" trio + pulled blockquote
 *   4. Format showcase - uniform ruled grid, no per-format color noise
 *   5. Closing CTA - quieter, italic-serif closing line
 *
 * No external assets - all visuals are inline SVG / CSS so there's nothing
 * to build or load.
 */
export function LandingPage() {
  return (
    <div className="space-y-24 pb-12 sm:space-y-32">
      <Hero />
      <HowItWorks />
      <Differentiator />
      <FormatShowcase />
      <ClosingCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative -mx-4 px-4 pt-10 sm:-mx-6 sm:px-6 sm:pt-16">
      {/* Soft radial halo behind the hero. Stays subtle so it doesn't read
          as a "gradient hero" template moment - just lifts the type a bit
          off the canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]"
      />
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="text-emerald-300/90">
          <Logo size={56} />
        </div>
        <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
          A cross-format taste engine
        </p>
        <h1 className="font-display mt-5 text-5xl font-medium leading-[1.02] text-neutral-50 sm:text-7xl">
          Your taste has a shape.
          <br />
          <em className="font-normal italic text-emerald-300/95">
            Resonance
          </em>{" "}
          finds it.
        </h1>
        <p className="mt-7 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
          Have a conversation about a few stories that stuck with you. Get
          recommendations grounded in the themes, archetypes, and narrative
          shapes you actually care about, across movies, TV, anime, manga,
          games, and books.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/sign-up"
            className="inline-flex items-center justify-center rounded-md bg-neutral-50 px-6 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-white"
          >
            Start the conversation
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-md border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 space-y-12 sm:space-y-16">
      <SectionEyebrow eyebrow="How it works" title="Three steps, no questionnaires" />
      <div className="grid gap-px overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800 lg:grid-cols-3">
        <Step
          n={1}
          title="Have a conversation"
          description="A media-savvy AI asks about moments that stuck. Not 'what's your favorite movie.' The scene you keep replaying, the feeling a story left you with. Adapts when you can't articulate the why."
        >
          <ChatPreview />
        </Step>
        <Step
          n={2}
          title="We build your taste DNA"
          description="Your conversation becomes a structured, versioned profile: themes, character archetypes, narrative preferences, the patterns you bounce off. Editable, evolves with feedback."
        >
          <ProfilePreview />
        </Step>
        <Step
          n={3}
          title="Get recs that actually land"
          description="The recommender names titles in your library. 'Has the same fractured-interior architecture you found in Disco Elysium' beats 'matches your profile.' Every recommendation is verified against real metadata, never hallucinated."
        >
          <RecPreview />
        </Step>
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 bg-neutral-950 p-7 sm:p-8">
      <div className="flex items-baseline gap-4">
        {/* Editorial numeral - large serif, low-emphasis color. Replaces the
            "circle badge with number" template look with something that
            reads as a magazine pull-out. */}
        <span
          className="font-display text-5xl font-normal leading-none text-emerald-300/40"
          aria-hidden
        >
          {n.toString().padStart(2, "0")}
        </span>
        <h3 className="font-display text-xl font-medium tracking-tight text-neutral-100">
          {title}
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-neutral-400">{description}</p>
      <div className="mt-auto pt-2">{children}</div>
    </div>
  );
}

/** Mock onboarding chat snippet - gives an immediate visual hook for what
 * the actual product looks like, without needing a real screenshot. */
function ChatPreview() {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3 text-xs">
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-neutral-900 px-3 py-2 text-neutral-200">
          What's a story that's been living rent-free in your head?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-emerald-900/30 px-3 py-2 text-emerald-100">
          The ending of Disco Elysium. Harry doesn't get redeemed, he just keeps
          showing up.
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-neutral-900 px-3 py-2 text-neutral-200">
          Burden-carrying that doesn't pretend it's heroic. Anything else hit
          you that way?
        </div>
      </div>
    </div>
  );
}

/** Mock profile snippet - shows what gets extracted. */
function ProfilePreview() {
  const themes = [
    { label: "Burden-carrying without redemption", weight: 0.92 },
    { label: "The void as a moral force", weight: 0.78 },
    { label: "Earned ambiguity in endings", weight: 0.71 },
  ];
  return (
    <div className="space-y-3 rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-500">
        Themes
      </p>
      <ul className="space-y-2.5">
        {themes.map((t) => (
          <li key={t.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-200">{t.label}</span>
              <span className="font-medium tabular-nums text-neutral-500">
                {Math.round(t.weight * 100)}
              </span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-emerald-400/80"
                style={{ width: `${t.weight * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mock rec card - shows the cross-reference explanation that's the
 * differentiation moment. */
function RecPreview() {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-800/80 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
        <span>Book · 2014</span>
        <span className="tabular-nums text-emerald-300">94 match</span>
      </div>
      <p className="font-display text-base font-medium leading-snug tracking-tight text-neutral-50">
        A Brief History of Seven Killings
      </p>
      <p className="text-xs leading-relaxed text-neutral-400">
        Same fractured-interior architecture you found in No Longer Human and
        Goodnight Punpun. Multiple voices carrying the weight of a place that's
        already broken them.
      </p>
      <ul className="flex flex-wrap gap-1 pt-1">
        <li className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
          burden-carrying
        </li>
        <li className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
          fractured interiority
        </li>
      </ul>
    </div>
  );
}

function Differentiator() {
  return (
    <section className="space-y-12 sm:space-y-14">
      <SectionEyebrow
        eyebrow="The actual hard part"
        title="Not the same recommendation problem"
      />
      <div className="grid gap-px overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800 sm:grid-cols-3">
        <NotThis title="Not genre matching">
          Genres are a coarse signal. Two horror movies can land for completely
          different reasons.
        </NotThis>
        <NotThis title="Not collaborative filtering">
          &quot;People who liked X also liked Y&quot; flattens you to a cohort.
          Resonance reads <em className="text-neutral-200">you</em>, not the
          cluster.
        </NotThis>
        <NotThis title="Not vibes-only">
          Every recommendation is verified against a real metadata source
          (TMDB, IGDB, Jikan, Open Library). No hallucinated titles.
        </NotThis>
      </div>
      {/* Editorial pull-quote. Vertical rule + italic serif lets this sit as
          the "thesis" beat of the page without leaning on color or chrome. */}
      <figure className="mx-auto max-w-3xl border-l-2 border-emerald-500/60 pl-6 sm:pl-8">
        <blockquote>
          <p className="font-display text-xl font-normal italic leading-relaxed text-neutral-100 sm:text-2xl">
            Resonance reads the themes, archetypes, and narrative structures
            that resonate with you, then finds them across every format. The
            model proposes; the system verifies; the explanation names a work
            you already love.
          </p>
        </blockquote>
      </figure>
    </section>
  );
}

function NotThis({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 bg-neutral-950 p-7 sm:p-8">
      <div className="flex items-center gap-2 text-neutral-200">
        <CrossIcon />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-sm leading-relaxed text-neutral-400">{children}</p>
    </div>
  );
}

function FormatShowcase() {
  const formats: { label: string; source: string; icon: React.ReactNode }[] = [
    { label: "Movies", source: "TMDB", icon: <FilmIcon /> },
    { label: "TV", source: "TMDB", icon: <TvIcon /> },
    { label: "Anime", source: "Jikan", icon: <SparkIcon /> },
    { label: "Manga", source: "Jikan", icon: <BookIcon /> },
    { label: "Games", source: "IGDB", icon: <GameIcon /> },
    { label: "Books", source: "Open Library", icon: <BookIcon /> },
  ];
  return (
    <section className="space-y-12 sm:space-y-14">
      <SectionEyebrow
        eyebrow="Cross-format"
        title="Six formats, one taste profile"
        body="The same patterns play out across mediums. A profile built from your favorite films can recommend the right book or the right game, and explain how they connect."
      />
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800 sm:grid-cols-3 lg:grid-cols-6">
        {formats.map((f) => (
          <li
            key={f.label}
            className="flex flex-col items-center gap-2 bg-neutral-950 px-4 py-7 text-center transition-colors hover:bg-neutral-900"
          >
            <span className="h-6 w-6 text-neutral-300" aria-hidden>
              {f.icon}
            </span>
            <span className="text-sm font-medium text-neutral-100">
              {f.label}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              {f.source}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 px-6 py-14 text-center sm:px-12 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-full bg-[radial-gradient(50%_80%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]"
      />
      <div className="relative space-y-6">
        <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-neutral-50 sm:text-5xl">
          Find what you&apos;d{" "}
          <em className="font-normal italic text-emerald-300/90">actually</em>{" "}
          love.
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
          Free to try. The first conversation takes about five minutes. You&apos;ll
          have your taste profile and your first recommendation batch in under
          ten.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/sign-up"
            className="inline-flex items-center justify-center rounded-md bg-neutral-50 px-6 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-white"
          >
            Start the conversation
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex items-center justify-center rounded-md border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Shared section header. Small-caps eyebrow, serif display title, optional
 * lead paragraph. Replaces the prior "emerald eyebrow + gradient h2" pattern
 * that ran on every section and read as template chrome.
 */
function SectionEyebrow({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl font-medium leading-[1.1] tracking-tight text-neutral-50 sm:text-5xl">
        {title}
      </h2>
      {body && (
        <p className="text-sm leading-relaxed text-neutral-400 sm:text-base">
          {body}
        </p>
      )}
    </div>
  );
}

function CrossIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="text-neutral-500"
      aria-hidden
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

// Inline format icons. Kept simple SVGs so there's no asset pipeline.
function FilmIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18" />
    </svg>
  );
}
function TvIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="m8 21 4-3 4 3" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  );
}
function GameIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 12h4M8 10v4" />
      <circle cx="16" cy="11" r="0.8" />
      <circle cx="16" cy="13" r="0.8" />
      <rect x="2" y="6" width="20" height="12" rx="6" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}
