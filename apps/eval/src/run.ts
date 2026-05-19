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
import { runInvariants } from "./invariants.js";
import {
  formatInvariantsMarkdown,
  timestampSlug,
  writeReport,
} from "./report.js";

type Suite = "invariants" | "all";

function parseArgs(argv: string[]): { suite: Suite } {
  const args = argv.slice(2);
  let suite: Suite = "all";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--suite") {
      const next = args[++i];
      if (next === "invariants" || next === "all") {
        suite = next;
      } else {
        console.error(`[eval] unknown --suite "${next}"`);
        process.exit(2);
      }
    }
  }
  return { suite };
}

async function main(): Promise<void> {
  const { suite } = parseArgs(process.argv);
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

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
