import { useMemo, useState } from "react";
import type { ProfileTrigger } from "@resonance/shared";
import {
  useProfileVersions,
  type ProfileVersionEntry,
} from "../../hooks/useProfileVersions.ts";
import { diffProfiles, type ProfileDiff } from "../../lib/profileDiff.ts";

const TRIGGER_LABEL: Record<ProfileTrigger, string> = {
  onboarding: "onboarding",
  feedback_batch: "feedback",
  manual_edit: "manual edit",
};

const TRIGGER_TONE: Record<ProfileTrigger, string> = {
  onboarding: "border-emerald-700/40 bg-emerald-950/20 text-emerald-300",
  feedback_batch: "border-amber-700/40 bg-amber-950/20 text-amber-300",
  manual_edit: "border-neutral-700/60 bg-neutral-900 text-neutral-300",
};

/**
 * "How your profile sharpened" — a structural diff of each profile_version
 * row against its predecessor, oldest to newest. Surfaces the persistent-
 * profile-evolution differentiator (CLAUDE.md: "I want this to be something
 * I'd be enthusiastic to use multiple times") that's otherwise invisible —
 * the data has always been stored, the UI just didn't show it.
 *
 * Collapsed by default to keep the profile page tidy; users opt in to the
 * detail. No AI cost — pure structural diff between adjacent versions.
 */
export function ProfileTimeline() {
  const versionsState = useProfileVersions();
  const [expanded, setExpanded] = useState(false);

  // Pair each version with the diff against its predecessor, descending so
  // newest reads first. v[0] has no predecessor; we render an "initial"
  // entry instead of a diff.
  const entries = useMemo(() => {
    if (versionsState.status !== "ready") return [];
    const sortedAsc = [...versionsState.versions].sort(
      (a, b) => a.versionNumber - b.versionNumber,
    );
    const out: { version: ProfileVersionEntry; diff: ProfileDiff | null }[] =
      [];
    for (let i = 0; i < sortedAsc.length; i++) {
      const v = sortedAsc[i]!;
      const prev = i > 0 ? sortedAsc[i - 1]! : null;
      const diff = prev ? diffProfiles(prev.profile, v.profile) : null;
      out.push({ version: v, diff });
    }
    return out.reverse();
  }, [versionsState]);

  if (versionsState.status === "loading") {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-400">
          How your profile sharpened
        </h2>
        <p className="text-xs text-neutral-600">Loading history…</p>
      </section>
    );
  }
  if (versionsState.status === "missing") return null;
  if (versionsState.status === "error") {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-400">
          How your profile sharpened
        </h2>
        <pre className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {versionsState.message}
        </pre>
      </section>
    );
  }

  const visible = expanded ? entries : entries.slice(0, 1);

  return (
    <section className="space-y-3 border-t border-neutral-800 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-400">
          How your profile sharpened
        </h2>
        {entries.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-emerald-400 underline-offset-2 hover:underline"
          >
            {expanded
              ? "Show latest only"
              : `Show all ${entries.length} versions →`}
          </button>
        )}
      </div>

      <ol className="space-y-3">
        {visible.map(({ version, diff }) => (
          <TimelineEntry key={version.id} version={version} diff={diff} />
        ))}
      </ol>
    </section>
  );
}

function TimelineEntry({
  version,
  diff,
}: {
  version: ProfileVersionEntry;
  diff: ProfileDiff | null;
}) {
  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-neutral-500">
          v{version.versionNumber}
        </span>
        <span className="text-neutral-500">
          {new Date(version.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 ${
            TRIGGER_TONE[version.trigger]
          }`}
        >
          {TRIGGER_LABEL[version.trigger]}
        </span>
      </header>

      {diff === null ? (
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          Initial profile · {version.profile.themes.length} themes,{" "}
          {version.profile.archetypes.length} archetypes,{" "}
          {version.profile.mediaAffinities.reduce(
            (n, a) => n + a.favorites.length,
            0,
          )}{" "}
          favorites across{" "}
          {version.profile.mediaAffinities
            .map((a) => a.format)
            .filter((f, i, arr) => arr.indexOf(f) === i)
            .join(", ")}
        </p>
      ) : diff.isEmpty ? (
        <p className="mt-2 text-xs text-neutral-500">
          No structural changes (likely a manual edit that adjusted wording
          rather than structure).
        </p>
      ) : (
        <DiffBody diff={diff} />
      )}
    </li>
  );
}

function DiffBody({ diff }: { diff: ProfileDiff }) {
  // One <li> per change so the timeline reads at-a-glance. Order matters:
  // theme adds/removes lead because they're the highest-signal changes;
  // weight shifts sit beneath them; meta-tags (avoidance, dislikedTitles)
  // round out below.
  const lines: { kind: "add" | "remove" | "shift"; text: string }[] = [];
  for (const t of diff.addedThemes) {
    lines.push({
      kind: "add",
      text: `Theme "${t.label}" (weight ${t.weight.toFixed(2)})`,
    });
  }
  for (const label of diff.removedThemes) {
    lines.push({ kind: "remove", text: `Theme "${label}"` });
  }
  for (const c of diff.themeWeightChanges) {
    lines.push({
      kind: "shift",
      text: `Theme "${c.label}" weight ${c.from.toFixed(2)} → ${c.to.toFixed(2)}`,
    });
  }
  for (const label of diff.addedArchetypes) {
    lines.push({ kind: "add", text: `Archetype "${label}"` });
  }
  for (const label of diff.removedArchetypes) {
    lines.push({ kind: "remove", text: `Archetype "${label}"` });
  }
  for (const v of diff.addedAvoidances) {
    lines.push({ kind: "add", text: `Avoidance: ${v}` });
  }
  for (const v of diff.removedAvoidances) {
    lines.push({ kind: "remove", text: `Avoidance: ${v}` });
  }
  for (const v of diff.addedDislikedTitles) {
    lines.push({ kind: "add", text: `Disliked title: "${v}"` });
  }
  for (const v of diff.removedDislikedTitles) {
    lines.push({ kind: "remove", text: `Disliked title: "${v}"` });
  }
  for (const f of diff.addedFormats) {
    lines.push({ kind: "add", text: `Enabled format: ${f}` });
  }
  for (const f of diff.removedFormats) {
    lines.push({ kind: "remove", text: `Disabled format: ${f}` });
  }
  for (const c of diff.formatComfortChanges) {
    lines.push({
      kind: "shift",
      text: `${c.format} comfort ${c.from.toFixed(2)} → ${c.to.toFixed(2)}`,
    });
  }
  if (diff.favoritesNetChange !== 0) {
    lines.push({
      kind: diff.favoritesNetChange > 0 ? "add" : "remove",
      text: `${
        diff.favoritesNetChange > 0 ? "+" : ""
      }${diff.favoritesNetChange} favorite${
        Math.abs(diff.favoritesNetChange) === 1 ? "" : "s"
      }`,
    });
  }

  return (
    <ul className="mt-2 space-y-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span
            aria-hidden
            className={`shrink-0 font-mono ${
              line.kind === "add"
                ? "text-emerald-400"
                : line.kind === "remove"
                  ? "text-red-400"
                  : "text-amber-400"
            }`}
          >
            {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : "↻"}
          </span>
          <span className="text-neutral-300">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
