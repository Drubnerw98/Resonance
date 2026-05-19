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

export async function writeReport(
  filename: string,
  body: string,
): Promise<string> {
  await mkdir(RUNS_DIR, { recursive: true });
  const path = resolve(RUNS_DIR, filename);
  await writeFile(path, body, "utf8");
  return path;
}
