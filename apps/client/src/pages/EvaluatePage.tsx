import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import {
  useEvaluate,
  type EvaluateMatch,
  type EvaluateStatus,
  type Verdict,
} from "../hooks/useEvaluate.ts";
import { useLibrary } from "../hooks/useLibrary.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { PageHeader } from "../components/shared/PageHeader.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { LoadingPulse } from "../components/shared/LoadingPulse.tsx";

const FORMAT_OPTIONS: { value: MediaType; label: string }[] = [
  { value: "movie", label: "Movie" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "game", label: "Game" },
  { value: "book", label: "Book" },
];

// Suggestions for users staring at a blank input — same pattern as the
// home dashboard's prompt chips. Mix across formats so the page advertises
// its cross-format reach.
const STARTER_TITLES: { format: MediaType; title: string }[] = [
  { format: "movie", title: "Severance" },
  { format: "game", title: "Hollow Knight" },
  { format: "book", title: "The Brothers Karamazov" },
  { format: "tv", title: "Mad Men" },
  { format: "anime", title: "Mushishi" },
];

/**
 * "Would I like X?" — type a title, pick a format, get a personalized verdict.
 *
 * Two phases:
 *   1. Search: server hits the right adapter and returns up to 3 matches; user
 *      disambiguates with a picker (we never auto-pick — the wrong work is
 *      worse than a small extra click).
 *   2. Score: server runs the chosen candidate through the verdict prompt and
 *      returns matchScore + verdict text + status flags. The user can save
 *      the candidate to their library directly from the verdict card.
 */
export function EvaluatePage() {
  const profile = useProfile();
  const evaluate = useEvaluate();
  const library = useLibrary();
  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("book");

  // Restrict the format dropdown to formats the user has enabled in their
  // profile. Mediums they've disabled don't show up — no point letting
  // them pick "anime" if they've removed anime from their affinities.
  // Falls back to all formats if profile is still loading or has no
  // affinities yet.
  const enabledFormats = new Set(
    profile.state.status === "ready"
      ? profile.state.profile.mediaAffinities.map((a) => a.format)
      : ["movie", "tv", "anime", "manga", "game", "book"],
  );
  const visibleFormats = FORMAT_OPTIONS.filter((opt) =>
    enabledFormats.has(opt.value),
  );

  // If the currently-selected format gets disabled (user navigated, profile
  // changed), snap to the first enabled one.
  if (visibleFormats.length > 0 && !enabledFormats.has(mediaType)) {
    setMediaType(visibleFormats[0]!.value);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    void evaluate.search({ title: trimmed, mediaType });
  }

  // Verdicts are scored against the profile + library. Without a profile,
  // the score endpoint throws — surface the missing-profile state up front
  // instead of letting users search and then hit a server error after they
  // pick a candidate. Same pattern as ExplorePage and RecommendationsPage.
  if (profile.state.status === "missing") {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Would I like…?"
          subtitle="Honest verdict on a specific title against your taste."
        />
        <EmptyState
          title="No profile yet"
          description="Verdicts are scored against your taste DNA. Finish onboarding first — once your profile is in, you can ask about any specific title."
          action={
            <Link
              to="/onboarding"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Start onboarding
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Would I like…?"
        subtitle="Type a specific title and we'll give you an honest read against your taste profile and library. Different from a recommendation feed: you pick the work, we tell you whether it'll land."
      />

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-4 sm:flex-row"
      >
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as MediaType)}
          aria-label="Format"
          className="rounded-md border border-transparent bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300 transition-colors focus:border-neutral-500 focus:bg-neutral-800 focus:outline-none"
        >
          {visibleFormats.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='Title (e.g. "Disco Elysium", "Mad Men", "Pachinko")'
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={
            !title.trim() ||
            evaluate.searchStatus === "searching" ||
            evaluate.scoreStatus === "scoring"
          }
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {evaluate.searchStatus === "searching" ? "Searching…" : "Evaluate"}
        </button>
      </form>

      {evaluate.error && (
        <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {evaluate.error}
        </pre>
      )}

      {/* Starter chips — only when the page is fresh (no search ever run).
          Helps people staring at the blank input figure out what to try.
          Only suggest titles in formats the user has enabled. */}
      {evaluate.searchStatus === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Try
          </span>
          {STARTER_TITLES.filter((s) => enabledFormats.has(s.format)).map(
            (s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  setTitle(s.title);
                  setMediaType(s.format);
                  void evaluate.search({
                    title: s.title,
                    mediaType: s.format,
                  });
                }}
                className="rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-emerald-700 hover:bg-emerald-950/30 hover:text-emerald-100"
              >
                {s.title}
              </button>
            ),
          )}
        </div>
      )}

      {evaluate.searchStatus === "ready" && evaluate.matches.length === 0 && (
        <p className="text-sm text-neutral-400">
          No matches. Try a different spelling or format.
        </p>
      )}

      {evaluate.searchStatus === "ready" && evaluate.matches.length > 0 && (
        <Picker
          matches={evaluate.matches}
          onPick={(id) => void evaluate.score(id)}
          activeId={evaluate.result?.candidate.mediaCacheId ?? null}
          isScoring={evaluate.scoreStatus === "scoring"}
        />
      )}

      {evaluate.scoreStatus === "scoring" && (
        <LoadingPulse message="Reading the synopsis and scoring against your profile…" />
      )}

      {evaluate.result && (
        <VerdictCard
          candidate={evaluate.result.candidate}
          verdict={evaluate.result.verdict}
          status={evaluate.result.status}
          onSaveToLibrary={async (candidate) => {
            await library.add({
              title: candidate.item.title,
              mediaType: candidate.item.mediaType,
              ...(candidate.item.year != null
                ? { year: candidate.item.year }
                : {}),
            });
          }}
          isAlreadyInLibrary={evaluate.result.status.inLibrary}
        />
      )}
    </section>
  );
}

function Picker({
  matches,
  onPick,
  activeId,
  isScoring,
}: {
  matches: EvaluateMatch[];
  onPick: (id: string) => void;
  activeId: string | null;
  isScoring: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Pick the one you mean
      </p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {matches.map((m) => {
          const isActive = m.mediaCacheId === activeId;
          return (
            <li key={m.mediaCacheId}>
              <button
                onClick={() => onPick(m.mediaCacheId)}
                disabled={isScoring}
                className={
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                  (isActive
                    ? "border-emerald-700 bg-emerald-950/20"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-600")
                }
              >
                {m.item.imageUrl ? (
                  <img
                    src={m.item.imageUrl}
                    alt={m.item.title}
                    loading="lazy"
                    className="h-20 w-14 flex-shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-14 flex-shrink-0 items-center justify-center rounded-sm bg-neutral-800 text-[10px] text-neutral-500">
                    no image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{m.item.title}</p>
                  <p className="text-xs text-neutral-500">
                    {m.item.year ?? "—"}
                    {m.item.rating != null
                      ? ` · ★ ${m.item.rating.toFixed(1)}`
                      : ""}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VerdictCard({
  candidate,
  verdict,
  status,
  onSaveToLibrary,
  isAlreadyInLibrary,
}: {
  candidate: EvaluateMatch;
  verdict: Verdict;
  status: EvaluateStatus;
  onSaveToLibrary: (candidate: EvaluateMatch) => Promise<void>;
  isAlreadyInLibrary: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(isAlreadyInLibrary);
  const scorePct = Math.round(verdict.matchScore * 100);
  const scoreColor = verdict.matchScore >= 0.6
    ? "text-emerald-400"
    : verdict.matchScore >= 0.4
      ? "text-amber-400"
      : "text-rose-400";

  async function handleSave() {
    if (saving || saved) return;
    setSaving(true);
    try {
      await onSaveToLibrary(candidate);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <header className="flex gap-4">
        <a
          href={candidate.item.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-shrink-0"
        >
          {candidate.item.imageUrl ? (
            <img
              src={candidate.item.imageUrl}
              alt={candidate.item.title}
              className="h-32 w-24 rounded-md object-cover sm:h-40 sm:w-28"
            />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-500 sm:h-40 sm:w-28">
              no image
            </div>
          )}
        </a>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {candidate.item.mediaType}
            {candidate.item.year ? ` · ${candidate.item.year}` : ""}
            {candidate.item.rating != null
              ? ` · ★ ${candidate.item.rating.toFixed(1)}`
              : ""}
          </p>
          <h2 className="text-xl font-semibold leading-tight">
            <a
              href={candidate.item.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {candidate.item.title}
            </a>
          </h2>
          <p className={`text-sm font-medium ${scoreColor}`}>
            {scorePct}% match
          </p>
        </div>
      </header>

      <StatusFlags status={status} />

      <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-200">
        {verdict.verdict}
      </p>

      {verdict.tasteTags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {verdict.tasteTags.map((tag, i) => (
            <li
              key={i}
              className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving || saved}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
            (saved
              ? "bg-emerald-700 text-white"
              : "border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50")
          }
        >
          {saved ? "✓ In library" : saving ? "Saving…" : "Save to library"}
        </button>
      </div>
    </article>
  );
}

function StatusFlags({ status }: { status: EvaluateStatus }) {
  const flags: { label: string; tone: "info" | "warn" | "ok" }[] = [];
  if (status.inDislikedTitles)
    flags.push({
      label: "You flagged this as not-for-you in onboarding",
      tone: "warn",
    });
  if (status.rejectedBefore && !status.inDislikedTitles)
    flags.push({ label: "You skipped or rated this low before", tone: "warn" });
  if (status.inSavedRecs)
    flags.push({ label: "You already saved this", tone: "ok" });
  else if (status.inLibrary)
    flags.push({ label: "Already in your library", tone: "ok" });
  if (status.previouslyRecommended && !status.inSavedRecs && !status.rejectedBefore)
    flags.push({
      label: "We recommended this in an earlier batch",
      tone: "info",
    });

  if (flags.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {flags.map((f, i) => {
        const cls =
          f.tone === "warn"
            ? "border-amber-800 bg-amber-950/40 text-amber-300"
            : f.tone === "ok"
              ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
              : "border-neutral-700 bg-neutral-900 text-neutral-300";
        return (
          <li
            key={i}
            className={`rounded-md border px-2 py-1 text-xs ${cls}`}
          >
            {f.label}
          </li>
        );
      })}
    </ul>
  );
}
