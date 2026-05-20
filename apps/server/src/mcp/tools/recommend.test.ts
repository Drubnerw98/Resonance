import { describe, expect, it, vi } from "vitest";
import type {
  MediaCacheRow,
  RecommendationBatchRow,
  RecommendationRow,
} from "../../db/schema.js";

// The MCP server module pulls in env validation at import time. Stub it here
// so the test runs without real env wiring — same shape used by other tests
// in this codebase (see services/ai/recommender.test.ts).
vi.mock("../../env.js", () => ({
  env: { FRONTEND_ORIGIN: "https://resonance-client.vercel.app" },
}));

vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildRecommendResponse } from "./recommend.js";

function fakeBatch(
  overrides: Partial<RecommendationBatchRow> = {},
): RecommendationBatchRow {
  return {
    id: "batch-1",
    userId: "user-1",
    name: null,
    prompt: null,
    droppedCandidates: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RecommendationBatchRow;
}

function fakeMedia(title: string, year: number | null): MediaCacheRow {
  return {
    id: `cache-${title}`,
    externalId: `ext-${title}`,
    source: "tmdb",
    mediaType: "movie",
    title,
    normalizedData: {
      externalId: `ext-${title}`,
      source: "tmdb",
      mediaType: "movie",
      title,
      description: "—",
      imageUrl: "https://image.tmdb.org/poster.jpg",
      rating: null,
      year,
      genres: [],
      externalUrl: `https://www.themoviedb.org/movie/${title}`,
      metadata: {},
    },
    fetchedAt: new Date(),
    expiresAt: new Date(),
  } as MediaCacheRow;
}

function fakeRec(
  title: string,
  year: number | null,
  matchScore: number,
  overrides: Partial<RecommendationRow> = {},
): RecommendationRow & { media: MediaCacheRow } {
  const media = fakeMedia(title, year);
  return {
    id: `rec-${title}`,
    userId: "user-1",
    batchId: "batch-1",
    mediaCacheId: media.id,
    matchScore,
    explanation: `Pick ${title}`,
    tasteTags: ["intimate"],
    crossReferences: null,
    status: "pending",
    rating: null,
    feedbackAt: null,
    createdAt: new Date(),
    ...overrides,
    media,
  } as RecommendationRow & { media: MediaCacheRow };
}

describe("buildRecommendResponse", () => {
  it("trims posters + synopses, keeps externalUrl, sorts by matchScore desc", () => {
    // matchScore is stored 0-1; buildRecommendResponse scales to 0-100.
    const recs = [
      fakeRec("Lower", 2020, 0.6),
      fakeRec("Higher", 2021, 0.92),
      fakeRec("Middle", 2019, 0.75),
    ];
    const out = buildRecommendResponse(fakeBatch(), recs, Date.now() - 12345);

    expect(out.recommendations.map((r) => r.title)).toEqual([
      "Higher",
      "Middle",
      "Lower",
    ]);
    // No poster / synopsis leak — we explicitly only emit the trimmed fields.
    expect(out.recommendations[0]).toEqual({
      title: "Higher",
      mediaType: "movie",
      year: 2021,
      matchScore: 92,
      explanation: "Pick Higher",
      tasteTags: ["intimate"],
      crossReferences: [],
      externalUrl: "https://www.themoviedb.org/movie/Higher",
    });
  });

  it("computes batchUrl from FRONTEND_ORIGIN's first comma-separated value", () => {
    const out = buildRecommendResponse(fakeBatch({ id: "b-42" }), [], Date.now());
    expect(out.batchUrl).toBe(
      "https://resonance-client.vercel.app/batches/b-42",
    );
  });

  it("summarizes droppedCandidates by reason", () => {
    const out = buildRecommendResponse(
      fakeBatch({
        droppedCandidates: [
          { title: "A", mediaType: "movie", reason: "avoidance", detail: "" },
          { title: "B", mediaType: "movie", reason: "avoidance", detail: "" },
          {
            title: "C",
            mediaType: "movie",
            reason: "format-disabled",
            detail: "",
          },
        ],
      }),
      [],
      Date.now(),
    );
    expect(out.droppedSummary).toEqual({
      count: 3,
      byReason: { avoidance: 2, "format-disabled": 1 },
    });
  });

  it("normalizes null crossReferences to empty array", () => {
    const out = buildRecommendResponse(
      fakeBatch(),
      [fakeRec("X", 2020, 0.5)],
      Date.now(),
    );
    expect(out.recommendations[0]!.crossReferences).toEqual([]);
  });

  it("scales matchScore from stored 0-1 to 0-100", () => {
    const out = buildRecommendResponse(
      fakeBatch(),
      [fakeRec("X", 2020, 0.93)],
      Date.now(),
    );
    expect(out.recommendations[0]!.matchScore).toBe(93);
  });

  it("preserves runtime seconds rounded to 1 decimal", () => {
    const out = buildRecommendResponse(
      fakeBatch(),
      [],
      Date.now() - 47_300,
    );
    // ±0.2s tolerance — test execution jitter.
    expect(out.runtimeSeconds).toBeGreaterThan(47.0);
    expect(out.runtimeSeconds).toBeLessThan(47.6);
  });
});
