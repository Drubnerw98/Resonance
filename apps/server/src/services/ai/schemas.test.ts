import { describe, expect, it } from "vitest";
import {
  CandidatesOutputSchema,
  DiscoveryThemesOutputSchema,
  LibraryAnnotationSchema,
  ScoredCandidatesOutputSchema,
  TasteProfileSchema,
  VerdictOutputSchema,
  WatchlistDecideOutputSchema,
} from "./schemas.js";

// Each AI output schema is the contract between the model and the database:
// it constrains generation server-side AND validates parsed output before we
// persist. These tests pin a happy path + at least one realistic violation
// per schema so a regression in the contract fails loudly in CI rather than
// silently corrupting a row.

describe("TasteProfileSchema", () => {
  const valid = {
    themes: [
      { label: "psychological interiority", weight: 0.8, evidence: "Aftersun" },
    ],
    archetypes: [{ label: "the lonely observer", attraction: "felt seen" }],
    narrativePrefs: {
      pacing: "slow-burn" as const,
      complexity: "layered" as const,
      tone: ["melancholic"],
      endings: "ambiguous",
    },
    mediaAffinities: [
      { format: "movie" as const, comfort: 0.9, favorites: ["Aftersun"] },
    ],
    avoidances: ["loud action"],
    dislikedTitles: [],
  };

  it("parses a complete profile", () => {
    expect(() => TasteProfileSchema.parse(valid)).not.toThrow();
  });

  it("backfills dislikedTitles default for older profiles", () => {
    const { dislikedTitles: _omit, ...withoutDisliked } = valid;
    void _omit;
    const parsed = TasteProfileSchema.parse(withoutDisliked);
    expect(parsed.dislikedTitles).toEqual([]);
  });

  it("rejects out-of-range theme weight", () => {
    const bad = {
      ...valid,
      themes: [{ label: "x", weight: 1.5, evidence: "y" }],
    };
    expect(() => TasteProfileSchema.parse(bad)).toThrow();
  });

  it("rejects unknown narrativePrefs.pacing value", () => {
    const bad = {
      ...valid,
      narrativePrefs: { ...valid.narrativePrefs, pacing: "frenetic" },
    };
    expect(() => TasteProfileSchema.parse(bad)).toThrow();
  });
});

describe("CandidatesOutputSchema", () => {
  it("parses a typical candidate plan", () => {
    const valid = {
      titleSuggestions: [
        { title: "Mishima", mediaType: "movie" as const, reason: "shared theme" },
      ],
      discoveryQueries: [
        { mediaType: "book" as const, genres: ["literary fiction"] },
      ],
    };
    expect(() => CandidatesOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects discoveryQueries with no genres", () => {
    const bad = {
      titleSuggestions: [],
      discoveryQueries: [{ mediaType: "movie", genres: [] }],
    };
    expect(() => CandidatesOutputSchema.parse(bad)).toThrow();
  });

  it("rejects more than 30 title suggestions", () => {
    const bad = {
      titleSuggestions: Array.from({ length: 31 }, (_, i) => ({
        title: `T${i}`,
        mediaType: "movie",
        reason: "r",
      })),
      discoveryQueries: [],
    };
    expect(() => CandidatesOutputSchema.parse(bad)).toThrow();
  });
});

describe("ScoredCandidatesOutputSchema", () => {
  it("parses a typical scoring response", () => {
    const valid = {
      recommendations: [
        {
          candidateId: "1",
          matchScore: 0.85,
          explanation: "matches your interiority theme",
          tasteTags: ["psychological", "quiet"],
        },
      ],
    };
    expect(() => ScoredCandidatesOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects matchScore > 1", () => {
    const bad = {
      recommendations: [
        {
          candidateId: "1",
          matchScore: 1.2,
          explanation: "x",
          tasteTags: [],
        },
      ],
    };
    expect(() => ScoredCandidatesOutputSchema.parse(bad)).toThrow();
  });
});

describe("VerdictOutputSchema", () => {
  it("parses a verdict response", () => {
    const valid = {
      matchScore: 0.6,
      verdict: "honest middle-ground read",
      tasteTags: ["arthouse"],
    };
    expect(() => VerdictOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects negative matchScore", () => {
    const bad = { matchScore: -0.1, verdict: "x", tasteTags: [] };
    expect(() => VerdictOutputSchema.parse(bad)).toThrow();
  });
});

describe("DiscoveryThemesOutputSchema", () => {
  it("parses a six-theme response", () => {
    const valid = {
      themes: Array.from({ length: 6 }, (_, i) => ({
        title: `Theme ${i}`,
        description: "an entry surface",
        formats: ["movie" as const],
        promptHint: "prompt body",
      })),
    };
    expect(() => DiscoveryThemesOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects empty themes array", () => {
    const bad = { themes: [] };
    expect(() => DiscoveryThemesOutputSchema.parse(bad)).toThrow();
  });

  it("rejects a theme with no formats", () => {
    const bad = {
      themes: [
        {
          title: "x",
          description: "y",
          formats: [],
          promptHint: "z",
        },
      ],
    };
    expect(() => DiscoveryThemesOutputSchema.parse(bad)).toThrow();
  });
});

describe("LibraryAnnotationSchema", () => {
  it("parses a typical annotation", () => {
    const valid = {
      fitNote:
        "This pairs your interiority theme with the lonely-observer archetype directly.",
      tasteTags: ["psychological interiority", "lonely observer"],
    };
    expect(() => LibraryAnnotationSchema.parse(valid)).not.toThrow();
  });

  it("rejects fitNote shorter than 20 chars", () => {
    const bad = { fitNote: "too short", tasteTags: ["x"] };
    expect(() => LibraryAnnotationSchema.parse(bad)).toThrow();
  });

  it("rejects empty tasteTags", () => {
    const bad = {
      fitNote: "x".repeat(40),
      tasteTags: [],
    };
    expect(() => LibraryAnnotationSchema.parse(bad)).toThrow();
  });
});

describe("WatchlistDecideOutputSchema", () => {
  it("parses a ranked-pick response", () => {
    const valid = {
      picks: [
        { candidateId: "1", rank: 1, explanation: "best mood fit" },
        { candidateId: "3", rank: 2, explanation: "second-best" },
      ],
    };
    expect(() => WatchlistDecideOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects non-integer rank", () => {
    const bad = {
      picks: [{ candidateId: "1", rank: 1.5, explanation: "x" }],
    };
    expect(() => WatchlistDecideOutputSchema.parse(bad)).toThrow();
  });
});
