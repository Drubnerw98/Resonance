import { Link } from "react-router-dom";
import { Logo } from "../shared/Logo.tsx";

/**
 * Signed-out landing page. Editorial-publication direction (Phase 4): the
 * page reads as a magazine essay, not a feature-marketing site. Asymmetric
 * hero, hairline rules instead of bordered cards, magazine numerals as
 * anchors, text-link CTAs underlined on hover, generous whitespace.
 *
 * Sections (top to bottom):
 *   1. Hero — left-aligned editorial display, eyebrow above, single CTA
 *      below as a hairline-underlined text link.
 *   2. Premise — single editorial paragraph with drop cap.
 *   3. How it works — three numbered sections, vertical flow.
 *   4. Differentiator — pull-quote as section thesis, short prose.
 *   5. Formats — flat ruled list, no icon grid.
 *   6. Closing — italic display line + text CTA.
 *
 * No external assets — all visuals inline SVG / CSS.
 */
export function LandingPage() {
  return (
    <div className="space-y-28 pb-20 sm:space-y-36">
      <Hero />
      <Premise />
      <HowItWorks />
      <Differentiator />
      <Formats />
      <ClosingCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="-mx-4 px-4 pt-12 sm:-mx-6 sm:px-6 sm:pt-20">
      <div className="mx-auto max-w-3xl">
        {/* Brand row — small, restrained, top-left. No center-aligned logo
            on a halo; the wordmark anchors the page from the corner like a
            masthead. */}
        <div className="flex items-center gap-2.5 text-emerald-300/85">
          <Logo size={18} />
          <span className="font-['IBM_Plex_Serif'] text-base font-medium italic text-neutral-100">
            Resonance
          </span>
        </div>

        {/* Editorial display. Newsreader italic carries the weight; the
            second line shifts to roman to keep the rhythm. Left-aligned to
            kill the "centered hero" template look. */}
        <h1 className="font-display mt-16 max-w-[18ch] text-5xl font-normal leading-[1.04] text-neutral-50 sm:mt-24 sm:text-7xl">
          <em className="font-normal italic">Your taste</em> has a shape.
          <br />
          Resonance finds it.
        </h1>

        {/* Lead paragraph. Parchment color, comfortable measure, no
            attempt to fit the screen — let it run. */}
        <p className="mt-10 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
          Have a conversation about a few stories that stuck with you. Get
          recommendations grounded in the themes, archetypes, and narrative
          shapes you actually care about — across movies, TV, anime, manga,
          games, and books.
        </p>

        {/* CTAs as editorial text links. Hairline underline on hover. The
            primary action gets the parchment color; the secondary stays
            quiet at neutral-500. Replaces the white-button-on-dark template
            with something that reads as designed type. */}
        <div className="mt-12 flex flex-wrap items-baseline gap-x-10 gap-y-4 sm:mt-16">
          <Link
            to="/sign-up"
            className="group inline-flex items-baseline gap-2.5 text-[15px] text-neutral-50 transition-colors"
          >
            <span className="border-b border-neutral-500 pb-1 transition-colors group-hover:border-neutral-100">
              Start the conversation
            </span>
            <span aria-hidden className="text-emerald-300/80">
              →
            </span>
          </Link>
          <a
            href="#how-it-works"
            className="text-[13px] text-neutral-500 transition-colors hover:text-neutral-200"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * The thesis paragraph. One editorial moment in Newsreader italic with a
 * drop cap on the first letter — pulls the page out of "feature site"
 * and into "this person has a point of view".
 */
function Premise() {
  return (
    <section className="mx-auto max-w-3xl">
      <p className="editorial-drop-cap font-display text-2xl font-normal leading-[1.45] italic text-neutral-100 sm:text-[28px]">
        Most recommenders flatten you into a cohort. Resonance reads what
        actually resonates — the themes, archetypes, and narrative shapes
        you keep returning to — and finds them across every format you
        consume.
      </p>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24">
      <div className="mx-auto max-w-3xl">
        <SectionEyebrow eyebrow="How it works" title="Three steps" />
        <div className="mt-14 space-y-16 sm:mt-20 sm:space-y-20">
          <Step
            n={1}
            title="Have a conversation"
            description="A media-savvy AI asks about moments that stuck. Not what's your favorite movie. The scene you keep replaying, the feeling a story left you with. Adapts when you can't articulate the why."
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
            description="The recommender names titles in your library. Has the same fractured-interior architecture you found in Disco Elysium beats matches your profile. Every recommendation is verified against real metadata, never hallucinated."
          >
            <RecPreview />
          </Step>
        </div>
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
    <article className="editorial-hairline grid gap-x-8 gap-y-6 pt-10 sm:grid-cols-[auto_1fr]">
      {/* Magazine numeral. Big serif, low-emphasis, sits in a left rail. */}
      <span
        className="editorial-numeral text-[64px] leading-none font-normal text-emerald-300/30 sm:text-[80px]"
        aria-hidden
      >
        {n.toString().padStart(2, "0")}
      </span>
      <div className="space-y-4">
        <h3 className="font-display text-2xl font-medium leading-tight tracking-tight text-neutral-50 sm:text-3xl">
          {title}
        </h3>
        <p className="max-w-xl text-[15px] leading-relaxed text-neutral-300">
          {description}
        </p>
        <div className="pt-3">{children}</div>
      </div>
    </article>
  );
}

/** Mock onboarding chat snippet. Restyled from the bordered card to a
 * hairlined inline rendering that reads as quoted dialogue rather than a
 * UI screenshot. */
function ChatPreview() {
  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed">
      <p className="text-neutral-500">
        <span className="editorial-eyebrow mr-3">AI</span>What&apos;s a story that&apos;s
        been living rent-free in your head?
      </p>
      <p className="text-emerald-200/90">
        <span className="editorial-eyebrow mr-3 text-emerald-300/70">You</span>
        The ending of Disco Elysium. Harry doesn&apos;t get redeemed, he just
        keeps showing up.
      </p>
      <p className="text-neutral-500">
        <span className="editorial-eyebrow mr-3">AI</span>Burden-carrying that
        doesn&apos;t pretend it&apos;s heroic. Anything else hit you that way?
      </p>
    </div>
  );
}

/** Mock profile preview. Slim listing, no bordered enclosure — the rhythm
 * of bar + label + score reads as the actual extracted document. */
function ProfilePreview() {
  const themes = [
    { label: "Burden-carrying without redemption", weight: 0.92 },
    { label: "The void as a moral force", weight: 0.78 },
    { label: "Earned ambiguity in endings", weight: 0.71 },
  ];
  return (
    <div className="max-w-md space-y-2.5 text-[13px]">
      <p className="editorial-eyebrow">Themes</p>
      <ul className="space-y-2.5">
        {themes.map((t) => (
          <li key={t.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-neutral-200">{t.label}</span>
              <span className="font-medium tabular-nums text-neutral-500">
                {Math.round(t.weight * 100)}
              </span>
            </div>
            <div className="h-px bg-neutral-800">
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

/** Mock rec card. Strips the bordered enclosure; the hairline rule above
 * frames it as a clipping from a longer document. */
function RecPreview() {
  return (
    <div className="max-w-lg space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-[11px] text-neutral-500">
        <span className="editorial-eyebrow">Book · 2014</span>
        <span className="font-display text-2xl font-medium leading-none tabular-nums text-emerald-300/90">
          94
        </span>
      </div>
      <p className="font-display text-xl font-medium leading-snug text-neutral-50">
        A Brief History of Seven Killings
      </p>
      <p className="text-[13px] leading-relaxed text-neutral-300">
        Same fractured-interior architecture you found in{" "}
        <em className="font-display not-italic text-neutral-100">No Longer Human</em>{" "}
        and{" "}
        <em className="font-display not-italic text-neutral-100">Goodnight Punpun</em>.
        Multiple voices carrying the weight of a place that&apos;s already broken
        them.
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-[11px] text-neutral-500">
        <li className="editorial-eyebrow">Burden-carrying</li>
        <li className="editorial-eyebrow">Fractured interiority</li>
      </ul>
    </div>
  );
}

function Differentiator() {
  return (
    <section className="mx-auto max-w-3xl">
      {/* Pull-quote as the section header. The thesis IS the section. */}
      <figure className="border-l border-emerald-400/40 pl-6 sm:pl-10">
        <blockquote>
          <p className="font-display text-2xl font-normal leading-[1.4] italic text-neutral-100 sm:text-3xl">
            The model proposes; the system verifies; the explanation names a
            work you already love.
          </p>
        </blockquote>
      </figure>
      {/* Three short prose blocks. Hairlines between, no card enclosures.
          This is what other people don't do — the contrast. */}
      <div className="mt-14 grid gap-10 sm:mt-20 sm:grid-cols-3 sm:gap-x-10">
        <NotThis title="Not genre matching">
          Genres are a coarse signal. Two horror movies can land for completely
          different reasons.
        </NotThis>
        <NotThis title="Not collaborative filtering">
          People who liked X also liked Y flattens you to a cohort. Resonance
          reads <em className="text-neutral-100">you</em>, not the cluster.
        </NotThis>
        <NotThis title="Not vibes-only">
          Every recommendation is verified against a real metadata source.
          TMDB, IGDB, Jikan, Open Library. No hallucinated titles.
        </NotThis>
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
    <div className="editorial-hairline space-y-3 pt-5">
      <p className="font-display text-base font-medium text-neutral-100">
        {title}
      </p>
      <p className="text-[14px] leading-relaxed text-neutral-400">
        {children}
      </p>
    </div>
  );
}

/**
 * Formats — flat table-of-contents listing. Replaces the icon grid with a
 * publication-style "in this issue" row, name + source. Cleaner, less
 * iconography-as-decoration.
 */
function Formats() {
  const formats: { label: string; source: string }[] = [
    { label: "Movies", source: "TMDB" },
    { label: "TV", source: "TMDB" },
    { label: "Anime", source: "Jikan" },
    { label: "Manga", source: "Jikan" },
    { label: "Games", source: "IGDB" },
    { label: "Books", source: "Open Library" },
  ];
  return (
    <section className="mx-auto max-w-3xl">
      <SectionEyebrow
        eyebrow="Cross-format"
        title="Six formats, one taste profile"
        body="The same patterns play out across mediums. A profile built from your favorite films can recommend the right book or the right game, and explain how they connect."
      />
      <ul className="mt-14 divide-y divide-neutral-800/80 sm:mt-16">
        {formats.map((f) => (
          <li
            key={f.label}
            className="flex items-baseline justify-between gap-6 py-4 transition-colors hover:bg-neutral-900/30"
          >
            <span className="font-display text-xl font-medium text-neutral-100 sm:text-2xl">
              {f.label}
            </span>
            <span className="editorial-eyebrow">{f.source}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-3xl pt-10">
      <h2 className="font-display max-w-[24ch] text-3xl font-normal leading-tight tracking-tight text-neutral-50 sm:text-5xl">
        Find what you&apos;d{" "}
        <em className="font-normal italic text-emerald-300/95">actually</em>{" "}
        love.
      </h2>
      <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-neutral-300">
        Free to try. The first conversation takes about five minutes. You&apos;ll
        have your taste profile and your first recommendation batch in under
        ten.
      </p>
      <div className="mt-10 flex flex-wrap items-baseline gap-x-10 gap-y-4">
        <Link
          to="/sign-up"
          className="group inline-flex items-baseline gap-2.5 text-[15px] text-neutral-50"
        >
          <span className="border-b border-neutral-500 pb-1 transition-colors group-hover:border-neutral-100">
            Start the conversation
          </span>
          <span aria-hidden className="text-emerald-300/80">
            →
          </span>
        </Link>
        <Link
          to="/sign-in"
          className="text-[13px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}

/**
 * Shared section header. Small-caps eyebrow above a Newsreader display
 * title and an optional lead paragraph. Editorial restraint — no
 * decorative chrome, no centered gradient.
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
    <div className="space-y-5">
      <p className="editorial-eyebrow">{eyebrow}</p>
      <h2 className="font-display max-w-[20ch] text-3xl font-normal leading-[1.1] tracking-tight text-neutral-50 sm:text-5xl">
        {title}
      </h2>
      {body && (
        <p className="max-w-xl text-[15px] leading-relaxed text-neutral-300">
          {body}
        </p>
      )}
    </div>
  );
}
