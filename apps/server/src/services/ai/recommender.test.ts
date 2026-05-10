import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, MediaType } from "@resonance/shared";

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
import { collectRealCandidates } from "./recommender.js";
import { canonicalizeTitle } from "./titleMatching.js";
import type { MediaCacheRow } from "../../db/schema.js";
import type { CandidatesOutput } from "./schemas.js";

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
  ];

  it.each(pairs)("collapses %s and %s to the same canonical", (a, b) => {
    expect(canonicalizeTitle(a)).toBe(canonicalizeTitle(b));
  });
});
