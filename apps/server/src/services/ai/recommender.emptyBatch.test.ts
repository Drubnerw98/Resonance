import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TasteProfile } from "@resonance/shared";

// Pins the empty-batch fix: the batch row is created before the pipeline
// runs (rec inserts reference it), so every failure path — AI call dies,
// zero candidates survive validation — must delete the still-pick-less row
// on the way out. Regression here re-surfaces as "Default · 0 picks" husks
// accumulating on /batches after failed generations.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BATCH_ID = "33333333-3333-4333-8333-333333333333";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

let capturedDeleteWhere: SQL | undefined;

vi.mock("../../db/index.js", () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () =>
          Promise.resolve([
            {
              id: BATCH_ID,
              userId: USER_ID,
              prompt: null,
              name: null,
              droppedCandidates: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }),
    delete: () => ({
      where: (cond: SQL) => {
        capturedDeleteWhere = cond;
        return Promise.resolve([]);
      },
    }),
    // discardBatchIfEmpty builds a NOT EXISTS subquery via db.select().
    // Returning a raw SQL fragment that embeds the inner WHERE keeps the
    // batch-id param visible to the assertions without faking a full
    // drizzle query builder.
    select: () => ({
      from: () => ({
        where: (cond: SQL) =>
          sql`select 1 from "recommendations" where ${cond}`,
      }),
    }),
    query: {
      recommendations: { findMany: () => Promise.resolve([]) },
      libraryItems: { findMany: () => Promise.resolve([]) },
    },
  },
}));

vi.mock("./client.js", () => ({
  getAnthropic: () => ({ messages: { parse: parseMock } }),
  ONBOARDING_MODEL: "claude-sonnet-4-6",
}));

vi.mock("../mediaCache.js", () => ({
  searchAndCacheByTitle: vi.fn(async () => []),
  searchAndCacheByQuery: vi.fn(async () => []),
  enrichWithRuntime: vi.fn(async (rows: unknown[]) => rows),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const profile: TasteProfile = {
  themes: [],
  archetypes: [],
  narrativePrefs: {
    pacing: "slow-burn",
    complexity: "layered",
    tone: [],
    endings: "ambiguous",
  },
  mediaAffinities: [{ format: "movie", comfort: 0.9, favorites: [] }],
  avoidances: [],
};

vi.mock("../profile.js", () => ({
  getActiveProfile: vi.fn(async () => ({ profileData: profile })),
}));

// collectAvoidTitles hits the DB through its own queries; everything else in
// titleMatching is pure and the real implementations should run.
vi.mock("./titleMatching.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./titleMatching.js")>();
  return {
    ...actual,
    collectAvoidTitles: vi.fn(async () => new Set<string>()),
  };
});

import { generateRecommendations } from "./recommender.js";

const dialect = new PgDialect();

function expectBatchDeleted(): void {
  expect(capturedDeleteWhere).toBeDefined();
  const query = dialect.sqlToQuery(capturedDeleteWhere!);
  expect(query.sql).toContain('"user_id"');
  expect(query.sql.toLowerCase()).toContain("not exists");
  expect(query.params).toContain(USER_ID);
  expect(query.params).toContain(BATCH_ID);
}

describe("generateRecommendations discards pick-less batches on failure", () => {
  beforeEach(() => {
    capturedDeleteWhere = undefined;
    parseMock.mockReset();
  });

  it("deletes the batch when the candidate-plan AI call throws", async () => {
    parseMock.mockRejectedValue(new Error("AI exploded"));

    await expect(generateRecommendations(USER_ID)).rejects.toThrow(
      "AI exploded",
    );
    expectBatchDeleted();
  });

  it("deletes the batch when zero candidates survive validation (422)", async () => {
    // Model proposes one title; the (mocked) adapter finds nothing — the
    // anti-hallucination filter drops it and the pipeline lands on 0.
    parseMock.mockResolvedValue({
      parsed_output: {
        titleSuggestions: [
          {
            title: "A Title That Does Not Exist",
            mediaType: "movie",
            reason: "r",
          },
        ],
        discoveryQueries: [],
      },
      stop_reason: "end_turn",
    });

    await expect(generateRecommendations(USER_ID)).rejects.toMatchObject({
      status: 422,
    });
    expectBatchDeleted();
  });
});
