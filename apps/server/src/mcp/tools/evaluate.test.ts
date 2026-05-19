import { describe, expect, it, vi } from "vitest";
import type {
  EvaluateResult,
  EvaluateStatus,
} from "../../services/ai/evaluate.js";
import type { MediaCacheRow } from "../../db/schema.js";

vi.mock("../../env.js", () => ({
  env: { FRONTEND_ORIGIN: "https://resonance-client.vercel.app" },
}));
vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Stub the AI service so importing the tool module doesn't pull in the
// real Anthropic client (which would fail env validation).
vi.mock("../../services/ai/evaluate.js", () => ({
  evaluateCandidate: vi.fn(),
  evaluateSearch: vi.fn(),
}));

import { buildEvaluateOutput } from "./evaluate.js";

const ZERO_STATUS: EvaluateStatus = {
  inLibrary: false,
  inSavedRecs: false,
  rejectedBefore: false,
  inDislikedTitles: false,
  previouslyRecommended: false,
};

function fakeCandidate(
  title: string,
  year: number | null,
  externalUrl: string | null,
): MediaCacheRow {
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
      imageUrl: null,
      rating: null,
      year,
      genres: [],
      externalUrl,
      metadata: {},
    },
    fetchedAt: new Date(),
    expiresAt: new Date(),
  } as MediaCacheRow;
}

describe("buildEvaluateOutput", () => {
  it("normalizes verdict.matchScore from 0-1 → 0-100", () => {
    const result: EvaluateResult = {
      candidate: fakeCandidate("Parasite", 2019, "https://tmdb.org/parasite"),
      verdict: { matchScore: 0.87, verdict: "Yes — very you.", tasteTags: [] },
      status: ZERO_STATUS,
    };
    const out = buildEvaluateOutput(result);
    expect(out.matchScore).toBe(87);
  });

  it("rounds the normalized score (handles 0.875 → 88, not 87.5)", () => {
    const result: EvaluateResult = {
      candidate: fakeCandidate("X", null, null),
      verdict: { matchScore: 0.875, verdict: "n/a", tasteTags: [] },
      status: ZERO_STATUS,
    };
    expect(buildEvaluateOutput(result).matchScore).toBe(88);
  });

  it("emits the candidate's title/mediaType/year/externalUrl", () => {
    const result: EvaluateResult = {
      candidate: fakeCandidate("Lady Bird", 2017, "https://tmdb.org/lb"),
      verdict: { matchScore: 0.5, verdict: "ok", tasteTags: ["intimate"] },
      status: ZERO_STATUS,
    };
    const out = buildEvaluateOutput(result);
    expect(out.matched).toEqual({
      title: "Lady Bird",
      mediaType: "movie",
      year: 2017,
      externalUrl: "https://tmdb.org/lb",
    });
    expect(out.tasteTags).toEqual(["intimate"]);
  });

  it("passes deterministic status flags through unchanged", () => {
    const status: EvaluateStatus = {
      ...ZERO_STATUS,
      inDislikedTitles: true,
      previouslyRecommended: true,
    };
    const out = buildEvaluateOutput({
      candidate: fakeCandidate("X", 2020, null),
      verdict: { matchScore: 0.4, verdict: "no", tasteTags: [] },
      status,
    });
    expect(out.status).toEqual(status);
  });
});
