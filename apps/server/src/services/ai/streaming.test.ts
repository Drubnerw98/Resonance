import { describe, expect, it } from "vitest";
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
  // ── Boundary-split coverage ──────────────────────────────────────────────
  {
    name: "open tag split at every char (one char per chunk)",
    chunks: "<thinking>secret</thinking>visible".split(""),
    expected: "visible",
    ready: false,
  },
  {
    name: "split exactly between open and content",
    chunks: ["<analysis>", "secret</analysis>visible"],
    expected: "visible",
    ready: false,
  },
  {
    name: "split exactly before close tag",
    chunks: ["<analysis>secret", "</analysis>visible"],
    expected: "visible",
    ready: false,
  },
  {
    name: "split inside opening bracket of close tag",
    chunks: ["<analysis>secret<", "/analysis>visible"],
    expected: "visible",
    ready: false,
  },
  {
    name: "split inside ready tag opening bracket",
    chunks: ["enough <", "ready/> done"],
    expected: "enough  done",
    ready: true,
  },
  {
    name: "two thinking blocks back-to-back across chunks",
    chunks: [
      "<thinking>one</think",
      "ing><thinking>two</thinking>visible",
    ],
    expected: "visible",
    ready: false,
  },
  {
    name: "ready tag after analysis with whitespace gap",
    chunks: ["<analysis>n</analysis> ", "<ready/>", "go"],
    expected: "go",
    ready: true,
  },
  // ── Malformed / edge cases ───────────────────────────────────────────────
  {
    name: "unclosed analysis block — flush drops everything after open",
    chunks: ["before <analysis>never closed and stream ends"],
    expected: "before ",
    ready: false,
  },
  {
    name: "unclosed thinking block — flush drops everything after open",
    chunks: ["before <thinking>"],
    expected: "before ",
    ready: false,
  },
  {
    name: "stray close tag without matching open passes through",
    chunks: ["foo</analysis>bar"],
    expected: "foo</analysis>bar",
    ready: false,
  },
  {
    name: "empty thinking block",
    chunks: ["a<thinking></thinking>b"],
    expected: "ab",
    ready: false,
  },
  {
    name: "ready signaled only once even when tag appears twice",
    chunks: ["<ready/> first <ready/> second"],
    // Leading whitespace suppression strips the space left by the first ready
    // tag (it precedes any visible content); the second one stays.
    expected: "first  second",
    ready: true,
  },
  {
    name: "tag-like text inside another tag is consumed by outer",
    chunks: ["<thinking>nested <analysis> won't matter</thinking>visible"],
    expected: "visible",
    ready: false,
  },
];

describe("StreamFilter", () => {
  it.each(cases)("$name", ({ chunks, expected, ready }) => {
    const filter = new StreamFilter();
    let out = "";
    let readySignaled = false;
    for (const chunk of chunks) {
      const r = filter.push(chunk);
      out += r.text;
      if (r.readySignaled) readySignaled = true;
    }
    out += filter.flush();
    expect(out).toBe(expected);
    expect(readySignaled).toBe(ready);
  });

  it("is robust to char-by-char streaming for arbitrary input", () => {
    const input =
      "<thinking>scratch pad</thinking>Hello <analysis>more</analysis>world <ready/>now";
    const expected = "Hello world now";

    const filter = new StreamFilter();
    let out = "";
    let ready = false;
    for (const ch of input) {
      const r = filter.push(ch);
      out += r.text;
      if (r.readySignaled) ready = true;
    }
    out += filter.flush();
    expect(out).toBe(expected);
    expect(ready).toBe(true);
  });
});
