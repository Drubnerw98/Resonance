import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, MediaType, TasteProfile } from "@resonance/shared";

// The recommender module imports db/index.js and ./client.js, both of which
// pull in env.ts and boot-validate env vars (process.exit on miss). Mock the
// chain so this test runs without real env wiring, and so collectRealCandidates
// can be exercised in isolation from real adapters.
vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("./client.js", () => ({
  getAnthropic: vi.fn(),
  ONBOARDING_MODEL: "claude-sonnet-4-6",
}));
vi.mock("../mediaCache.js", () => ({
  searchAndCacheByTitle: vi.fn(),
  searchAndCacheByQuery: vi.fn(),
  enrichWithRuntime: vi.fn(async (rows: unknown[]) => rows),
}));
vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  searchAndCacheByQuery,
  searchAndCacheByTitle,
} from "../mediaCache.js";
import {
  collectRealCandidates,
  dropFabricatedCrossReferences,
  type LibraryItem,
} from "./recommender.js";
import { canonicalizeTitle } from "./titleMatching.js";
import type {
  DroppedCandidate,
  MediaCacheRow,
} from "../../db/schema.js";
import type { CandidatesOutput, ScoredCandidatesOutput } from "./schemas.js";

const mockSearchByTitle = vi.mocked(searchAndCacheByTitle);
const mockSearchByQuery = vi.mocked(searchAndCacheByQuery);

let nextId = 1;
function fakeRow(
  title: string,
  mediaType: MediaType,
  overrides: Partial<MediaItem> = {},
): MediaCacheRow {
  const item: MediaItem = {
    externalId: `ext-${nextId++}`,
    source: "tmdb",
    mediaType,
    title,
    description: "—",
    imageUrl: null,
    rating: null,
    year: null,
    genres: [],
    externalUrl: "",
    metadata: {},
    ...overrides,
  };
  return {
    id: `cache-${item.externalId}`,
    externalId: item.externalId,
    source: item.source,
    mediaType: item.mediaType,
    title: item.title,
    normalizedData: item,
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  } as MediaCacheRow;
}

const ALL_FORMATS = new Set<MediaType>([
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

function plan(
  titles: { title: string; mediaType: MediaType }[],
  queries: { mediaType: MediaType; genres: string[] }[] = [],
): CandidatesOutput {
  return {
    titleSuggestions: titles.map((t) => ({ ...t, reason: "fits" })),
    discoveryQueries: queries,
  };
}

describe("collectRealCandidates", () => {
  beforeEach(() => {
    mockSearchByTitle.mockReset();
    mockSearchByQuery.mockReset();
  });

  it("drops candidates that match a profile favorite (canonical match)", async () => {
    mockSearchByTitle.mockImplementation(async (_t, title) => [
      fakeRow(title, "movie"),
    ]);

    const out = await collectRealCandidates(
      plan([
        { title: "Aftersun", mediaType: "movie" },
        { title: "Mishima", mediaType: "movie" },
      ]),
      new Set(),
      new Set([canonicalizeTitle("Aftersun")]),
      new Set(),
      new Set(),
      ALL_FORMATS,
    );

    const titles = out.map((r) => r.normalizedData.title);
    expect(titles).toEqual(["Mishima"]);
  });

  it("drops candidates that match an avoid-list entry", async () => {
    mockSearchByTitle.mockImplementation(async (_t, title) => [
      fakeRow(title, "movie"),
    ]);

    const out = await collectRealCandidates(
      plan([
        { title: "The Name of the Wind", mediaType: "book" },
        { title: "Mishima", mediaType: "movie" },
      ]),
      new Set(),
      new Set(),
      new Set([canonicalizeTitle("The Name of the Wind")]),
      new Set(),
      ALL_FORMATS,
    );

    expect(out.map((r) => r.normalizedData.title)).toEqual(["Mishima"]);
  });

  it("hard-filters disabled formats regardless of what the model proposed", async () => {
    mockSearchByTitle.mockImplementation(async (mediaType, title) => [
      fakeRow(title, mediaType),
    ]);

    const enabledFormats = new Set<MediaType>(["movie", "tv"]);
    const out = await collectRealCandidates(
      plan([
        { title: "Mishima", mediaType: "movie" },
        // The model proposed a game; the user has disabled games — must drop.
        { title: "Disco Elysium", mediaType: "game" },
        { title: "Mad Men", mediaType: "tv" },
      ]),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      enabledFormats,
    );

    const formats = out.map((r) => r.mediaType);
    expect(formats).toContain("movie");
    expect(formats).toContain("tv");
    expect(formats).not.toContain("game");
  });

  it("dedupes against previously-recommended titles via canonical matching", async () => {
    // Cross-batch series-variant case: prior batch had "Vinland Saga", this
    // batch's plan proposes "Vinland Saga Season 2" — they collapse.
    mockSearchByTitle.mockImplementation(async (_t, title) => [
      fakeRow(title, "anime"),
    ]);

    const out = await collectRealCandidates(
      plan([
        { title: "Vinland Saga Season 2", mediaType: "anime" },
        { title: "Mushishi", mediaType: "anime" },
      ]),
      new Set(),
      new Set(),
      new Set(),
      new Set([canonicalizeTitle("Vinland Saga")]),
      ALL_FORMATS,
    );

    expect(out.map((r) => r.normalizedData.title)).toEqual(["Mushishi"]);
  });

  it("dedupes within a single batch when title + discovery query both surface the same work", async () => {
    const sharedRow = fakeRow("Mishima", "movie");
    mockSearchByTitle.mockResolvedValue([sharedRow]);
    mockSearchByQuery.mockResolvedValue([sharedRow]);

    const out = await collectRealCandidates(
      plan(
        [{ title: "Mishima", mediaType: "movie" }],
        [{ mediaType: "movie", genres: ["arthouse"] }],
      ),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      ALL_FORMATS,
    );

    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(sharedRow.id);
  });

  it("respects the per-format cap when one format floods the pool", async () => {
    // Open Library-style flooding: the discovery query returns 30 books.
    // Per-format cap is 12, so only 12 books should survive even though the
    // pool is otherwise unconstrained.
    mockSearchByQuery.mockImplementation(async (q) => {
      if (q.mediaType === "book") {
        return Array.from({ length: 30 }, (_, i) =>
          fakeRow(`Book ${i}`, "book"),
        );
      }
      return [];
    });
    mockSearchByTitle.mockResolvedValue([]);

    const out = await collectRealCandidates(
      plan([], [{ mediaType: "book", genres: ["literary fiction"] }]),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      ALL_FORMATS,
    );

    const bookCount = out.filter((r) => r.mediaType === "book").length;
    expect(bookCount).toBe(12);
  });

  it("survives an adapter rejection without losing the rest of the batch", async () => {
    // Promise.allSettled discipline — if IGDB's call rejects, TMDB results
    // should still come through.
    mockSearchByTitle.mockImplementation(async (mediaType, title) => {
      if (mediaType === "game") throw new Error("IGDB unreachable");
      return [fakeRow(title, mediaType)];
    });

    const out = await collectRealCandidates(
      plan([
        { title: "Disco Elysium", mediaType: "game" },
        { title: "Mishima", mediaType: "movie" },
      ]),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      ALL_FORMATS,
    );

    expect(out.map((r) => r.normalizedData.title)).toEqual(["Mishima"]);
  });
});

describe("collectRealCandidates dropped accumulator", () => {
  beforeEach(() => {
    mockSearchByTitle.mockReset();
    mockSearchByQuery.mockReset();
  });

  it("records hallucinated reasons when title search returns 0 hits", async () => {
    // Model proposes a title; adapter finds nothing (the anti-hallucination
    // signal). One real hit alongside should still come through.
    mockSearchByTitle.mockImplementation(async (_t, title) => {
      if (title === "A Title That Doesn't Exist") return [];
      return [fakeRow(title, "movie")];
    });

    const dropped: DroppedCandidate[] = [];
    await collectRealCandidates(
      plan([
        { title: "Mishima", mediaType: "movie" },
        { title: "A Title That Doesn't Exist", mediaType: "movie" },
      ]),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      ALL_FORMATS,
      dropped,
    );

    expect(dropped).toEqual([
      expect.objectContaining({
        title: "A Title That Doesn't Exist",
        reason: "hallucinated",
      }),
    ]);
  });

  it("records format-disabled drops with the disabled mediaType", async () => {
    mockSearchByTitle.mockImplementation(async (mediaType, title) => [
      fakeRow(title, mediaType),
    ]);

    const dropped: DroppedCandidate[] = [];
    await collectRealCandidates(
      plan([
        { title: "Disco Elysium", mediaType: "game" },
        { title: "Mishima", mediaType: "movie" },
      ]),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      new Set(["movie", "tv"]),
      dropped,
    );

    expect(
      dropped.find((d) => d.reason === "format-disabled"),
    ).toMatchObject({ title: "Disco Elysium", mediaType: "game" });
  });

  it("records disliked-title drops when a candidate matches the avoid set", async () => {
    mockSearchByTitle.mockImplementation(async (_t, title) => [
      fakeRow(title, "book"),
    ]);

    const dropped: DroppedCandidate[] = [];
    await collectRealCandidates(
      plan([{ title: "The Name of the Wind", mediaType: "book" }]),
      new Set(),
      new Set(),
      new Set([canonicalizeTitle("The Name of the Wind")]),
      new Set(),
      ALL_FORMATS,
      dropped,
    );

    expect(dropped).toEqual([
      expect.objectContaining({
        title: "The Name of the Wind",
        reason: "disliked-title",
      }),
    ]);
  });

  it("records duplicate drops when a candidate matches a prior batch (canonical)", async () => {
    mockSearchByTitle.mockImplementation(async (_t, title) => [
      fakeRow(title, "anime"),
    ]);

    const dropped: DroppedCandidate[] = [];
    await collectRealCandidates(
      plan([{ title: "Vinland Saga Season 2", mediaType: "anime" }]),
      new Set(),
      new Set(),
      new Set(),
      new Set([canonicalizeTitle("Vinland Saga")]),
      ALL_FORMATS,
      dropped,
    );

    expect(dropped).toEqual([
      expect.objectContaining({
        title: "Vinland Saga Season 2",
        reason: "duplicate",
      }),
    ]);
  });

  it("does not double-record when the same canonical title shows up twice", async () => {
    // Model proposes a hallucinated title twice (title search 0-hit) AND
    // it shows up in discovery queries. We should record one drop, not two.
    mockSearchByTitle.mockResolvedValue([]);
    mockSearchByQuery.mockResolvedValue([]);

    const dropped: DroppedCandidate[] = [];
    await collectRealCandidates(
      plan(
        [
          { title: "Imaginary Movie", mediaType: "movie" },
          { title: "Imaginary Movie", mediaType: "movie" },
        ],
        [],
      ),
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      ALL_FORMATS,
      dropped,
    );

    expect(dropped.filter((d) => d.title === "Imaginary Movie")).toHaveLength(
      1,
    );
  });
});

describe("canonicalizeTitle", () => {
  // Pin the bits of the canonicalizer that the dedup logic above depends on.
  // The heuristic shape is in services/ai/recommender.ts; if any of these
  // collapse pairs stop matching, cross-batch dedup quietly regresses.
  const pairs: [string, string][] = [
    ["The Last of Us", "Last of Us"],
    ["Final Fantasy VII Remastered", "Final Fantasy VII"],
    ["Disco Elysium - The Final Cut", "Disco Elysium"],
    ["Planescape: Torment Enhanced Edition", "Planescape: Torment"],
    ["Republic, The", "Republic"],
    ["Avatar (2009)", "Avatar"],
    // Roman-vs-Arabic sequel numerals collapse to one canonical so within-
    // and cross-batch dedup catches "RDR2" / "RDR II" style duplicates.
    ["Red Dead Redemption II: Ultimate Edition", "Red Dead Redemption 2"],
    ["Final Fantasy VII", "Final Fantasy 7"],
  ];

  it.each(pairs)("collapses %s and %s to the same canonical", (a, b) => {
    expect(canonicalizeTitle(a)).toBe(canonicalizeTitle(b));
  });

  it("does not normalize single-character Roman numerals", () => {
    // "I"/"V"/"X" as a standalone token are far more often a word or title
    // letter than a sequel number — normalizing them would wreck "I Am
    // Legend", "V for Vendetta", "Mega Man X". Only multi-character numerals
    // (II, VII, …) collapse.
    expect(canonicalizeTitle("V for Vendetta")).not.toBe(
      canonicalizeTitle("5 for Vendetta"),
    );
    expect(canonicalizeTitle("I Am Legend")).toBe("i am legend");
  });
});

describe("dropFabricatedCrossReferences", () => {
  // Minimal profile: one favorite the model can legitimately anchor to.
  const profile: TasteProfile = {
    themes: [],
    archetypes: [],
    narrativePrefs: {
      pacing: "slow-burn",
      complexity: "layered",
      tone: [],
      endings: "ambiguous",
    },
    mediaAffinities: [
      { format: "game", comfort: 0.8, favorites: ["Disco Elysium"] },
    ],
    avoidances: [],
    dislikedTitles: [],
  };
  const library: LibraryItem[] = [
    { title: "Hades", mediaType: "game", source: "imported", rating: null },
  ];

  function scoredWith(
    crossReferences: { title: string; reason: string }[],
  ): ScoredCandidatesOutput {
    return {
      recommendations: [
        {
          candidateId: "1",
          matchScore: 0.8,
          explanation: "—",
          tasteTags: [],
          crossReferences,
        },
      ],
    };
  }

  it("keeps cross-references whose title the user actually named", () => {
    const out = dropFabricatedCrossReferences(
      scoredWith([{ title: "Hades", reason: "shared roguelike loop" }]),
      profile,
      library,
    );
    expect(out.recommendations[0]!.crossReferences).toEqual([
      { title: "Hades", reason: "shared roguelike loop" },
    ]);
  });

  it("drops a cross-reference citing a title absent from profile + library", () => {
    const out = dropFabricatedCrossReferences(
      scoredWith([
        { title: "Pillars of Eternity", reason: "fabricated anchor" },
      ]),
      profile,
      library,
    );
    expect(out.recommendations[0]!.crossReferences).toBeUndefined();
  });

  it("drops only the fabricated entry, keeping anchored ones and the rec", () => {
    const out = dropFabricatedCrossReferences(
      scoredWith([
        { title: "Hades", reason: "real anchor" },
        { title: "Pillars of Eternity", reason: "fabricated anchor" },
      ]),
      profile,
      library,
    );
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0]!.crossReferences).toEqual([
      { title: "Hades", reason: "real anchor" },
    ]);
  });
});
