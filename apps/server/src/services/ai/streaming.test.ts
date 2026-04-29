// Quick smoke test, run with: pnpm tsx src/services/ai/streaming.test.ts
// Not part of the typecheck/build — just a hand-runnable sanity script.
import { StreamFilter } from "./streaming.js";

interface Case {
  name: string;
  chunks: string[];
  expected: string;
  ready: boolean;
}

const cases: Case[] = [
  {
    name: "passthrough no tags",
    chunks: ["hello ", "world"],
    expected: "hello world",
    ready: false,
  },
  {
    name: "single chunk with analysis",
    chunks: ["before <analysis>secrets</analysis>after"],
    expected: "before after",
    ready: false,
  },
  {
    name: "single chunk with thinking",
    chunks: ["before <thinking>secrets</thinking>after"],
    expected: "before after",
    ready: false,
  },
  {
    name: "analysis tag split across chunks",
    chunks: ["hello <ana", "lysis>hidden</analysis> visible"],
    expected: "hello  visible",
    ready: false,
  },
  {
    name: "thinking tag split across chunks",
    chunks: ["hello <think", "ing>hidden</thinking> visible"],
    expected: "hello  visible",
    ready: false,
  },
  {
    name: "close tag split across chunks",
    chunks: ["<analysis>hidden</analy", "sis>visible"],
    expected: "visible",
    ready: false,
  },
  {
    name: "thinking close tag split across chunks",
    chunks: ["<thinking>hidden</think", "ing>visible"],
    expected: "visible",
    ready: false,
  },
  {
    name: "ready tag",
    chunks: ["I have enough <ready/> to extract"],
    expected: "I have enough  to extract",
    ready: true,
  },
  {
    name: "ready tag split",
    chunks: ["enough <re", "ady/> done"],
    expected: "enough  done",
    ready: true,
  },
  {
    name: "analysis then ready",
    chunks: ["<analysis>x</analysis>visible <ready/>"],
    expected: "visible ",
    ready: true,
  },
  {
    name: "thinking then visible then ready",
    chunks: ["<thinking>scratch</thinking>That moment in DE <ready/>"],
    expected: "That moment in DE ",
    ready: true,
  },
  {
    name: "leading whitespace after analysis block is suppressed",
    chunks: ["<analysis>note</analysis>\n\n", "Hello there"],
    expected: "Hello there",
    ready: false,
  },
  {
    name: "leading whitespace after thinking block is suppressed",
    chunks: ["<thinking>note</thinking>\n\nHello "],
    expected: "Hello ",
    ready: false,
  },
  {
    name: "lone < not a tag start",
    chunks: ["x < y"],
    expected: "x < y",
    ready: false,
  },
];

let failed = 0;
for (const c of cases) {
  const filter = new StreamFilter();
  let out = "";
  let ready = false;
  for (const chunk of c.chunks) {
    const r = filter.push(chunk);
    out += r.text;
    if (r.readySignaled) ready = true;
  }
  out += filter.flush();
  const pass = out === c.expected && ready === c.ready;
  if (!pass) {
    failed++;
    console.error(`FAIL ${c.name}`);
    console.error(`  expected: ${JSON.stringify(c.expected)} ready=${c.ready}`);
    console.error(`  actual:   ${JSON.stringify(out)} ready=${ready}`);
  } else {
    console.log(`pass  ${c.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failures`);
  process.exit(1);
}
console.log(`\nall ${cases.length} cases passed`);
