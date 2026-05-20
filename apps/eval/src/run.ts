/**
 * Eval entrypoint. Parses --suite, runs the requested suite, writes a
 * markdown report under apps/eval/runs/, and exits non-zero if any
 * invariant failed (so a future CI integration can gate merges on it).
 *
 * Usage:
 *   pnpm eval                       # runs every suite (just invariants for now)
 *   pnpm eval -- --suite invariants
 *   EVAL_USER_ID=<uuid> pnpm eval   # scope to one user
 */

import { env } from "./env.js";
import { runHeldOut } from "./heldOut.js";
import { runInvariants } from "./invariants.js";
import { runJudge } from "./judge.js";
import {
  formatHeldOutMarkdown,
  formatInvariantsMarkdown,
  formatJudgeMarkdown,
  timestampSlug,
  writeReport,
} from "./report.js";

type Suite = "invariants" | "heldout" | "judge" | "all";

interface ParsedArgs {
  suite: Suite;
  n?: number;
  batchId?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const out: ParsedArgs = { suite: "all" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--suite") {
      const next = args[++i];
      if (
        next === "invariants" ||
        next === "heldout" ||
        next === "judge" ||
        next === "all"
      ) {
        out.suite = next;
      } else {
        console.error(`[eval] unknown --suite "${next}"`);
        process.exit(2);
      }
    } else if (a === "--n") {
      const next = args[++i];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        console.error(`[eval] --n must be a positive integer, got "${next}"`);
        process.exit(2);
      }
      out.n = parsed;
    } else if (a === "--batch") {
      const next = args[++i];
      if (!next) {
        console.error("[eval] --batch requires a batch id");
        process.exit(2);
      }
      out.batchId = next;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { suite, n, batchId } = parseArgs(process.argv);
  const startedAt = new Date();
  const scope = env.EVAL_USER_ID
    ? `single user (${env.EVAL_USER_ID})`
    : "all users";

  let allPass = true;
  const stamp = timestampSlug(startedAt);

  if (suite === "invariants" || suite === "all") {
    console.log(`[eval] running invariants suite — scope: ${scope}`);
    const result = await runInvariants(
      env.EVAL_USER_ID ? { userId: env.EVAL_USER_ID } : {},
    );
    const finishedAt = new Date();
    const body = formatInvariantsMarkdown(result, {
      startedAt,
      finishedAt,
      scope,
    });
    const path = await writeReport(`${stamp}-invariants.md`, body);
    console.log(`[eval] invariants report → ${path}`);
    for (const r of result.reports) {
      const s = r.violationsFound === 0 ? "PASS" : "FAIL";
      console.log(`  [${s}] ${r.name} — ${r.violationsFound} violations`);
      if (r.violationsFound > 0) allPass = false;
    }
    console.log(
      `[eval] batches: ${result.totalBatches} · recs: ${result.totalRecs}`,
    );
  }

  if (suite === "heldout" || suite === "all") {
    if (!env.EVAL_USER_ID) {
      console.error(
        "[eval] heldout suite requires EVAL_USER_ID — held-out is per-user by construction (you can't hide titles 'from all users')",
      );
      process.exit(2);
    }
    console.log(
      `[eval] running heldout suite — user: ${env.EVAL_USER_ID}${n ? `, n=${n}` : ""}`,
    );
    const startedHeldOut = new Date();
    const heldOutOptions: { userId: string; n?: number } = {
      userId: env.EVAL_USER_ID,
    };
    if (n !== undefined) heldOutOptions.n = n;
    const result = await runHeldOut(heldOutOptions);
    const finishedHeldOut = new Date();
    const body = formatHeldOutMarkdown(result, {
      startedAt: startedHeldOut,
      finishedAt: finishedHeldOut,
      scope,
    });
    const path = await writeReport(`${stamp}-heldout.md`, body);
    console.log(`[eval] heldout report → ${path}`);
    for (const p of result.probes) {
      const tag = p.error ? "ERR " : p.hit ? "HIT " : "MISS";
      const where = p.batchId
        ? `batch ${p.batchId.slice(0, 8)}…`
        : `error: ${p.error ?? "unknown"}`;
      console.log(
        `  [${tag}] ${p.heldOutTitle} (${p.heldOutMediaType}) — ${p.recCount} recs in ${where}`,
      );
    }
    const pct = (result.recall * 100).toFixed(0);
    console.log(
      `[eval] recall: ${result.hits}/${result.heldOutCount} (${pct}%)`,
    );
  }

  if (suite === "judge" || suite === "all") {
    if (!env.EVAL_USER_ID) {
      console.error(
        "[eval] judge suite requires EVAL_USER_ID — judging is per-user (it reads one user's profile + batch)",
      );
      process.exit(2);
    }
    console.log(
      `[eval] running judge suite — user: ${env.EVAL_USER_ID}${batchId ? `, batch=${batchId}` : " (most recent batch)"}${n ? `, n=${n}` : ""}`,
    );
    const startedJudge = new Date();
    const judgeOptions: { userId: string; batchId?: string; n?: number } = {
      userId: env.EVAL_USER_ID,
    };
    if (batchId !== undefined) judgeOptions.batchId = batchId;
    if (n !== undefined) judgeOptions.n = n;
    const result = await runJudge(judgeOptions);
    const finishedJudge = new Date();
    const body = formatJudgeMarkdown(result, {
      startedAt: startedJudge,
      finishedAt: finishedJudge,
      scope,
    });
    const path = await writeReport(`${stamp}-judge.md`, body);
    console.log(`[eval] judge report → ${path}`);
    for (const r of result.recs) {
      console.log(
        `  [${r.verdict.overall}/5] ${r.title} — spec ${r.verdict.specificity} · align ${r.verdict.alignment} · anchor ${r.verdict.anchoring}`,
      );
    }
    console.log(
      `[eval] judge overall: ${result.averages.overall.toFixed(2)}/5 across ${result.judgedCount} recs`,
    );
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
