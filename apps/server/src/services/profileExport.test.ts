import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TasteProfile } from "@resonance/shared";

const recommendationsFindMany = vi.fn();
vi.mock("../db/index.js", () => ({
  db: {
    query: {
      recommendations: { findMany: () => recommendationsFindMany() },
    },
  },
}));

const listLibraryItemsMock = vi.fn();
vi.mock("./library.js", () => ({
  listLibraryItems: (userId: string) => listLibraryItemsMock(userId),
}));

import {
  buildProfileExport,
  deriveAvoidances,
  deriveFavorites,
} from "./profileExport.js";

function makeProfile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    themes: [],
    archetypes: [],
    narrativePrefs: {
      pacing: "variable",
      complexity: "focused",
      tone: [],
      endings: "—",
    },
    mediaAffinities: [],
    avoidances: [],
    dislikedTitles: [],
    ...overrides,
  };
}

describe("deriveFavorites", () => {
  it("tags each favorite with the themes/archetypes that mention it", () => {
    const profile = makeProfile({
      mediaAffinities: [
        { format: "movie", comfort: 0.9, favorites: ["Aftersun"] },
        { format: "tv", comfort: 0.8, favorites: ["Mad Men"] },
      ],
      themes: [
        { label: "memory + grief", weight: 0.8, evidence: "loved Aftersun" },
        { label: "ambition", weight: 0.6, evidence: "Mad Men centers craft" },
      ],
      archetypes: [
        {
          label: "the perceptive outsider",
          attraction: "Don Draper in Mad Men",
        },
      ],
    });
    const out = deriveFavorites(profile);

    expect(out).toHaveLength(2);
    const aftersun = out.find((f) => f.title === "Aftersun")!;
    expect(aftersun.themes).toContain("memory + grief");
    expect(aftersun.archetypes).toEqual([]);

    const madMen = out.find((f) => f.title === "Mad Men")!;
    expect(madMen.themes).toContain("ambition");
    expect(madMen.archetypes).toContain("the perceptive outsider");
  });
});

describe("deriveAvoidances", () => {
  it("tags abstract patterns vs named titles with `kind`", () => {
    const profile = makeProfile({
      avoidances: ["nihilism for shock value"],
      dislikedTitles: ["The Walking Dead"],
    });
    const out = deriveAvoidances(profile);
    expect(out).toEqual([
      { description: "nihilism for shock value", kind: "pattern" },
      { description: "The Walking Dead", kind: "title" },
    ]);
  });

  it("tolerates a profile predating the dislikedTitles field", () => {
    const profile = makeProfile({ avoidances: ["torture porn"] });
    // Simulate a pre-field profile shape without dislikedTitles.
    delete (profile as Partial<TasteProfile>).dislikedTitles;
    const out = deriveAvoidances(profile);
    expect(out).toEqual([{ description: "torture porn", kind: "pattern" }]);
  });
});

describe("buildProfileExport", () => {
  beforeEach(() => {
    recommendationsFindMany.mockReset();
    listLibraryItemsMock.mockReset();
  });

  it("ships only manual library items (drops bulk imports)", async () => {
    listLibraryItemsMock.mockResolvedValue([
      {
        id: "lib-1",
        title: "Aftersun",
        mediaType: "movie",
        year: 2022,
        rating: null,
        source: "manual",
        status: "consumed",
        fitNote: "elegiac",
        tasteTags: ["memory"],
      },
      {
        id: "lib-2",
        title: "Some Letterboxd Movie",
        mediaType: "movie",
        year: 2010,
        rating: 3,
        // Bulk-imported — should be filtered out.
        source: "letterboxd",
        status: "consumed",
        fitNote: null,
        tasteTags: [],
      },
    ]);
    recommendationsFindMany.mockResolvedValue([]);

    const out = await buildProfileExport("u1", makeProfile());
    expect(out.library).toHaveLength(1);
    expect(out.library[0]!.title).toBe("Aftersun");
    // Synthetic source label preserved for Constellation's contract.
    expect(out.library[0]!.source).toBe("library");
  });

  it("dedupes recommendations by media_cache_id (newest wins)", async () => {
    listLibraryItemsMock.mockResolvedValue([]);
    // findMany already returns newest-first; emulate a duplicate at the tail.
    recommendationsFindMany.mockResolvedValue([
      {
        id: "rec-newest",
        mediaCacheId: "cache-A",
        matchScore: 0.9,
        explanation: "newest",
        tasteTags: [],
        status: "pending",
        rating: null,
        media: {
          title: "A",
          mediaType: "movie",
          normalizedData: { year: 2024 },
        },
      },
      {
        id: "rec-older",
        mediaCacheId: "cache-A",
        matchScore: 0.7,
        explanation: "older dup",
        tasteTags: [],
        status: "rated",
        rating: 4,
        media: {
          title: "A",
          mediaType: "movie",
          normalizedData: { year: 2024 },
        },
      },
      {
        id: "rec-other",
        mediaCacheId: "cache-B",
        matchScore: 0.6,
        explanation: "other",
        tasteTags: [],
        status: "pending",
        rating: null,
        media: {
          title: "B",
          mediaType: "tv",
          normalizedData: { year: 2020 },
        },
      },
    ]);

    const out = await buildProfileExport("u1", makeProfile());
    expect(out.recommendations.map((r) => r.id)).toEqual([
      "rec-newest",
      "rec-other",
    ]);
  });

  it("returns the profile snapshot it was given (versions endpoint contract)", async () => {
    listLibraryItemsMock.mockResolvedValue([]);
    recommendationsFindMany.mockResolvedValue([]);
    const profile = makeProfile({ avoidances: ["pat"] });
    const out = await buildProfileExport("u1", profile);
    expect(out.profile).toBe(profile);
    expect(out.avoidances).toEqual([
      { description: "pat", kind: "pattern" },
    ]);
  });
});
