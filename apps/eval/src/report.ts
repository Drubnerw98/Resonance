/**
 * Markdown report writer for eval runs.
 *
 * Reports land under `apps/eval/runs/` keyed by ISO timestamp. They're plain
 * markdown so they render nicely on GitHub and diff sensibly between runs.
 * The summary table is the headline; full violations land under per-
 * invariant sections so a passing run stays tight.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HeldOutRunResult } from "./heldOut.js";
import type { InvariantsRunResult } from "./invariants.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(here, "..", "runs");

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** ISO-derived filename-safe timestamp (UTC), seconds resolution. */
export function timestampSlug(date: Date = new Date()): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

export interface ReportContext {
  startedAt: Date;
  finishedAt: Date;
  scope: string;
}

export function formatInvariantsMarkdown(
  result: InvariantsRunResult,
  ctx: ReportContext,
): string {
  const lines: string[] = [];
  const allPass = result.reports.every((r) => r.violationsFound === 0);
  const status = allPass ? "✅ PASS" : "❌ FAIL";
  lines.push(`# Resonance eval — invariants ${status}`);
  lines.push("");
  lines.push(`- **Started:** ${ctx.startedAt.toISOString()}`);
  lines.push(`- **Finished:** ${ctx.finishedAt.toISOString()}`);
  lines.push(`- **Scope:** ${ctx.scope}`);
  lines.push(`- **Batches checked:** ${result.totalBatches}`);
  lines.push(`- **Recs checked:** ${result.totalRecs}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Invariant | Violations | Status |");
  lines.push("| --- | ---: | --- |");
  for (const r of result.reports) {
    const s = r.violationsFound === 0 ? "✅" : "❌";
    lines.push(`| \`${r.name}\` | ${r.violationsFound} | ${s} |`);
  }
  lines.push("");

  const failing = result.reports.filter((r) => r.violationsFound > 0);
  if (failing.length === 0) {
    lines.push(
      "No violations. The anti-hallucination, dedup, and canonical-mediaType guarantees held across every persisted batch.",
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Failing invariants");
  lines.push("");
  for (const r of failing) {
    lines.push(`### \`${r.name}\``);
    lines.push("");
    lines.push(r.description);
    lines.push("");
    lines.push(
      `${r.violationsFound} violation${r.violationsFound === 1 ? "" : "s"} across ${r.batchesChecked} batch${r.batchesChecked === 1 ? "" : "es"}:`,
    );
    lines.push("");
    // Cap the displayed list at 25 so a runaway invariant doesn't produce a
    // 10-megabyte report. Total count still appears in the summary.
    const shown = r.violations.slice(0, 25);
    lines.push("| Batch | Detail |");
    lines.push("| --- | --- |");
    for (const v of shown) {
      lines.push(`| \`${v.batchId.slice(0, 8)}…\` | ${v.detail} |`);
    }
    if (r.violations.length > shown.length) {
      lines.push("");
      lines.push(
        `_…and ${r.violations.length - shown.length} more, omitted for brevity._`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatHeldOutMarkdown(
  result: HeldOutRunResult,
  ctx: ReportContext,
): string {
  const lines: string[] = [];
  const pct = (result.recall * 100).toFixed(0);
  lines.push(`# Resonance eval — held-out recall: ${result.hits}/${result.heldOutCount} (${pct}%)`);
  lines.push("");
  lines.push(`- **Started:** ${ctx.startedAt.toISOString()}`);
  lines.push(`- **Finished:** ${ctx.finishedAt.toISOString()}`);
  lines.push(`- **Scope:** ${ctx.scope}`);
  lines.push("");
  lines.push(
    "**Methodology.** For each held-out title, the pipeline runs with the title hidden from `getUserLibrary` (via the `excludeLibraryTitles` recommender option). Held-out candidates are pre-filtered to titles NOT in profile favorites AND NOT in any past recommendation — so the only channel the system had to discover them was the library row we just hid. A canonicalized match in the resulting batch's recs counts as a recall hit.",
  );
  lines.push("");
  lines.push(
    "**Caveat.** The recommender is non-deterministic; a single trial is noisy. Multi-trial averaging is future work.",
  );
  lines.push("");

  if (result.probes.length === 0) {
    lines.push(
      `No probes ran${result.skipped.length > 0 ? ` — ${result.skipped.length} library candidates were rejected as not-clean (see below).` : "."}`,
    );
    lines.push("");
  } else {
    lines.push("## Probes");
    lines.push("");
    lines.push("| Held-out title | Format | Rating | Recs | Outcome | Matched as | Wall (s) |");
    lines.push("| --- | --- | --- | ---: | :---: | --- | ---: |");
    for (const p of result.probes) {
      const outcome = p.error
        ? "⚠️ err"
        : p.hit
          ? "✅ hit"
          : "❌ miss";
      const matched = p.error ? `\`${p.error}\`` : p.hitTitle ?? "—";
      lines.push(
        `| ${p.heldOutTitle} | ${p.heldOutMediaType} | ${p.heldOutRating ?? "—"} | ${p.recCount} | ${outcome} | ${matched} | ${p.runtimeSeconds} |`,
      );
    }
    const errored = result.probes.filter((p) => p.error !== null).length;
    if (errored > 0) {
      lines.push("");
      lines.push(
        `_${errored} probe${errored === 1 ? "" : "s"} hit a pipeline error before scoring — those are excluded from the recall denominator (the system can't be charged with a miss for a title it never got to consider). See findings._`,
      );
    }
    lines.push("");
  }

  if (result.skipped.length > 0) {
    lines.push("## Skipped library candidates");
    lines.push("");
    lines.push(
      `${result.skipped.length} clean-test candidates were rejected (signal would have leaked through another channel):`,
    );
    lines.push("");
    lines.push("| Title | Reason |");
    lines.push("| --- | --- |");
    for (const s of result.skipped.slice(0, 25)) {
      lines.push(`| ${s.title} | ${s.reason} |`);
    }
    if (result.skipped.length > 25) {
      lines.push("");
      lines.push(`_…and ${result.skipped.length - 25} more, omitted for brevity._`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function writeReport(
  filename: string,
  body: string,
): Promise<string> {
  await mkdir(RUNS_DIR, { recursive: true });
  const path = resolve(RUNS_DIR, filename);
  await writeFile(path, body, "utf8");
  return path;
}
