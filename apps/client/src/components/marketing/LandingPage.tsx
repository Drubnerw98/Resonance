import { Link } from "react-router-dom";
import { Logo } from "../shared/Logo.tsx";

/**
 * Signed-out landing page. Lives at "/" when SignedOut. Replaces the prior
 * minimal hero — this is what hiring managers / curious visitors see when
 * they hit a shared link, so it has to explain what Resonance is and why
 * it's interesting in under 10 seconds.
 *
 * Sections (top to bottom):
 *   1. Hero — headline, tagline, primary + secondary CTAs
 *   2. How it works — 3-step visual showing the chat → profile → rec flow
 *   3. Differentiator — why this isn't genre matching / collab filtering
 *   4. Format showcase — visual row of the six formats Resonance covers
 *   5. Closing CTA
 *
 * No external assets — all visuals are inline SVG / CSS so there's
 * nothing to build or load. Mobile-responsive throughout (this page is
 * the most likely to be opened on a phone via shared link).
 */
export function LandingPage() {
  return (
    <div className="space-y-20 py-6 sm:space-y-28 sm:py-10">
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
    <section className="relative space-y-8 text-center sm:space-y-10">
      <div className="flex justify-center">
        <div className="text-emerald-300">
          <Logo size={64} />
        </div>
      </div>
      <div className="space-y-4">
        <h1 className="bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-4xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-6xl">
          Your taste has a shape.
          <br />
          <span className="text-emerald-300">Resonance finds it.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
          An AI-powered taste-DNA engine for movies, TV, anime, manga,
          games, and books. Have a conversation about a few stories that
          stuck with you — get recommendations grounded in the themes,
          archetypes, and narrative shapes you actually care about.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/sign-up"
          className="rounded-md bg-white px-6 py-3 text-base font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-neutral-200"
        >
          Get started
        </Link>
        <a
          href="#how-it-works"
          className="rounded-md border border-neutral-700 px-6 py-3 text-base font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
        >
          See how it works
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="space-y-10 sm:space-y-14">
      <div className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          How it works
        </p>
        <h2 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Three steps, no questionnaires
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Step
          n={1}
          title="Have a conversation"
          description="A media-savvy AI asks you about moments that stuck. Not 'what's your favorite movie' — what scene you keep replaying, what feeling a story left you with. Adapts when you can't articulate the why."
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
          description="The recommender names titles in your library by name. 'Has the same fractured-interior architecture you found in Disco Elysium' beats 'matches your profile.' Verified against real metadata — no hallucinated titles."
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
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-700 bg-emerald-950/40 text-sm font-semibold text-emerald-300">
          {n}
        </span>
        <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-neutral-400">{description}</p>
      <div className="pt-2">{children}</div>
    </div>
  );
}

/** Mock onboarding chat snippet — gives an immediate visual hook for what
 * the actual product looks like, without needing a real screenshot. */
function ChatPreview() {
  return (
    <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-xs">
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-900 px-3 py-2 text-neutral-200">
          What's a story that's been living rent-free in your head?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-900/40 px-3 py-2 text-emerald-100">
          The ending of Disco Elysium. Harry doesn't get redeemed, he just
          keeps showing up.
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-900 px-3 py-2 text-neutral-200">
          Burden-carrying that doesn't pretend it's heroic. Anything
          else hit you that way?
        </div>
      </div>
    </div>
  );
}

/** Mock profile snippet — shows what gets extracted. */
function ProfilePreview() {
  const themes = [
    { label: "Burden-carrying without redemption", weight: 0.92, color: "bg-emerald-500" },
    { label: "The void as a moral force", weight: 0.78, color: "bg-teal-500" },
    { label: "Earned ambiguity in endings", weight: 0.71, color: "bg-amber-500" },
  ];
  return (
    <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-xs">
      <p className="font-semibold uppercase tracking-wider text-neutral-500">
        Themes
      </p>
      <ul className="space-y-2">
        {themes.map((t) => (
          <li key={t.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-200">{t.label}</span>
              <span className="text-neutral-500">
                {Math.round(t.weight * 100)}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={`h-full ${t.color}`}
                style={{ width: `${t.weight * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mock rec card — shows the cross-reference explanation that's the
 * differentiation moment. */
function RecPreview() {
  return (
    <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
        <span>Book · 2014</span>
        <span className="font-semibold text-emerald-400">94% match</span>
      </div>
      <p className="text-sm font-semibold text-neutral-100">
        A Brief History of Seven Killings
      </p>
      <p className="text-xs leading-relaxed text-neutral-400">
        Same fractured-interior architecture you found in No Longer Human
        and Goodnight Punpun — multiple voices carrying the weight of a
        place that's already broken them.
      </p>
      <ul className="flex flex-wrap gap-1">
        <li className="rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2 py-0.5 text-[10px] text-emerald-200/90">
          burden-carrying
        </li>
        <li className="rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2 py-0.5 text-[10px] text-emerald-200/90">
          fractured interiority
        </li>
      </ul>
    </div>
  );
}

function Differentiator() {
  return (
    <section className="space-y-8">
      <div className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          The actual hard part
        </p>
        <h2 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Not the same recommendation problem
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NotThis title="Not genre matching">
          Genres are a coarse signal. Two horror movies can land for
          completely different reasons.
        </NotThis>
        <NotThis title="Not collaborative filtering">
          &quot;People who liked X also liked Y&quot; flattens you to a cohort.
          Resonance reads <em>you</em>, not the cluster.
        </NotThis>
        <NotThis title="Not vibes-only">
          Every recommendation is verified against a real metadata source
          (TMDB, IGDB, Jikan, Open Library). No hallucinated titles.
        </NotThis>
      </div>
      <div className="mx-auto max-w-3xl rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-5 text-center">
        <p className="text-sm leading-relaxed text-emerald-100 sm:text-base">
          Resonance reads the <strong>themes, archetypes, and narrative
          structures</strong> that resonate with you, then finds them across
          every format. The model proposes; the system verifies; the
          explanation names a work you already love.
        </p>
      </div>
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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <p className="mb-2 text-sm font-semibold text-rose-300">{title}</p>
      <p className="text-sm leading-relaxed text-neutral-400">{children}</p>
    </div>
  );
}

function FormatShowcase() {
  const formats: { label: string; color: string; icon: React.ReactNode }[] = [
    { label: "Movies", color: "border-rose-700 text-rose-300", icon: <FilmIcon /> },
    { label: "TV", color: "border-amber-700 text-amber-300", icon: <TvIcon /> },
    { label: "Anime", color: "border-fuchsia-700 text-fuchsia-300", icon: <SparkIcon /> },
    { label: "Manga", color: "border-violet-700 text-violet-300", icon: <BookIcon /> },
    { label: "Games", color: "border-emerald-700 text-emerald-300", icon: <GameIcon /> },
    { label: "Books", color: "border-sky-700 text-sky-300", icon: <BookIcon /> },
  ];
  return (
    <section className="space-y-8">
      <div className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Cross-format
        </p>
        <h2 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Six formats, one taste profile
        </h2>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base">
          The same patterns play out across mediums. A profile built from
          your favorite films can recommend the right book or the right
          game — and explain how they connect.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {formats.map((f) => (
          <li
            key={f.label}
            className={`flex flex-col items-center gap-2 rounded-lg border bg-neutral-900 px-3 py-5 text-center ${f.color}`}
          >
            <span className="h-7 w-7" aria-hidden>
              {f.icon}
            </span>
            <span className="text-sm font-medium text-neutral-200">
              {f.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/30 via-neutral-900 to-neutral-950 px-6 py-12 text-center sm:px-10 sm:py-16">
      <div className="space-y-5">
        <h2 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Find what you'd actually love
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
          Free to try. The first conversation takes about five minutes.
          You'll have your taste profile and your first recommendation
          batch in under ten.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/sign-up"
            className="rounded-md bg-white px-6 py-3 text-base font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-neutral-200"
          >
            Get started
          </Link>
          <Link
            to="/sign-in"
            className="rounded-md border border-neutral-700 px-6 py-3 text-base font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

// Inline format icons. Kept simple SVGs so there's no asset pipeline.
function FilmIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18" />
    </svg>
  );
}
function TvIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="m8 21 4-3 4 3" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  );
}
function GameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h4M8 10v4" />
      <circle cx="16" cy="11" r="0.8" />
      <circle cx="16" cy="13" r="0.8" />
      <rect x="2" y="6" width="20" height="12" rx="6" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}
