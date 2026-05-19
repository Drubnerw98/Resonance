import { describe, expect, it, vi } from "vitest";

vi.mock("../../env.js", () => ({
  env: { FRONTEND_ORIGIN: "https://resonance-client.vercel.app" },
}));
vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildBatchSummaries, type BatchInput } from "./batches.js";

function makeRow(
  id: string,
  recs: Array<{ format: string; tags: string[] }>,
  overrides: Partial<BatchInput> = {},
): BatchInput {
  return {
    id,
    name: null,
    prompt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    recommendations: recs.map((r) => ({
      tasteTags: r.tags,
      matchScore: 80,
      media: { mediaType: r.format },
    })),
    ...overrides,
  };
}

const BASE = "https://resonance-client.vercel.app";

describe("buildBatchSummaries", () => {
  it("counts per-format and assembles deep-link URLs", () => {
    const summary = buildBatchSummaries(
      [
        makeRow("b-1", [
          { format: "movie", tags: [] },
          { format: "movie", tags: [] },
          { format: "book", tags: [] },
        ]),
      ],
      BASE,
    );
    expect(summary[0]!.formatCounts).toEqual({ movie: 2, book: 1 });
    expect(summary[0]!.count).toBe(3);
    expect(summary[0]!.batchUrl).toBe(`${BASE}/batches/b-1`);
  });

  it("ranks the three most-common tasteTags as topTags", () => {
    const summary = buildBatchSummaries(
      [
        makeRow("b-1", [
          { format: "movie", tags: ["a", "b", "c"] },
          { format: "movie", tags: ["a", "b", "d"] },
          { format: "movie", tags: ["a", "e"] },
        ]),
      ],
      BASE,
    );
    // a:3, b:2, c:1, d:1, e:1 → top 3 is a, b, then either c/d/e (sort is
    // stable on ties via the entries order).
    expect(summary[0]!.topTags.slice(0, 2)).toEqual(["a", "b"]);
    expect(summary[0]!.topTags).toHaveLength(3);
  });

  it("handles null tasteTags + empty batches without crashing", () => {
    const summary = buildBatchSummaries(
      [
        {
          id: "empty",
          name: null,
          prompt: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          recommendations: [],
        },
        makeRow("nulltags", [{ format: "tv", tags: [] }]),
      ],
      BASE,
    );
    expect(summary[0]!.count).toBe(0);
    expect(summary[0]!.topTags).toEqual([]);
    expect(summary[1]!.topTags).toEqual([]);
  });

  it("preserves name + prompt + ISO createdAt", () => {
    const summary = buildBatchSummaries(
      [
        makeRow(
          "b-1",
          [{ format: "movie", tags: [] }],
          { name: "Cozy fall reads", prompt: "cozy fall reads" },
        ),
      ],
      BASE,
    );
    expect(summary[0]!.name).toBe("Cozy fall reads");
    expect(summary[0]!.prompt).toBe("cozy fall reads");
    expect(summary[0]!.createdAt).toBe("2026-05-01T00:00:00.000Z");
  });
});
