import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastOnboardingFormInput, TasteProfile } from "@resonance/shared";

// Mock the env-touching chain so this suite runs in CI without real keys.
// Same pattern as recommender.test.ts.
vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("./client.js", () => ({
  getAnthropic: vi.fn(),
  ONBOARDING_MODEL: "claude-sonnet-4-6",
}));

const mockParse = vi.fn();
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  // The real helper returns a JSON-schema config the SDK consumes. The fast
  // extraction service only forwards it to client.messages.parse, which we
  // also mock — so a passthrough sentinel is enough here.
  zodOutputFormat: vi.fn(() => ({ kind: "fake-format" })),
}));

// Ambient reference so the mocked client uses our mockParse for messages.parse.
// We can't `vi.mock("./client.js")` AND import getAnthropic to wire the spy,
// so instead we shim the mock above to return a client whose messages.parse
// resolves with whatever the test queues up.
import { getAnthropic } from "./client.js";
const mockedGetAnthropic = vi.mocked(getAnthropic);

import { extractProfileFromForm } from "./fastExtraction.js";

function makeProfile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    themes: [
      {
        label: "burden-carrying protagonists",
        weight: 0.8,
        evidence: "Disco Elysium, Aftersun",
      },
    ],
    archetypes: [
      {
        label: "the principled outsider",
        attraction: "reads systems better than systems read them",
      },
    ],
    narrativePrefs: {
      pacing: "slow-burn",
      complexity: "layered",
      tone: ["bittersweet"],
      endings: "ambiguous over neat",
    },
    mediaAffinities: [
      { format: "movie", comfort: 0.85, favorites: ["Aftersun", "Past Lives"] },
    ],
    avoidances: ["chosen-one plots"],
    dislikedTitles: [],
    ...overrides,
  };
}

function setModelResponse(profile: TasteProfile): void {
  mockedGetAnthropic.mockReturnValue({
    messages: {
      parse: mockParse,
    },
    // The full Anthropic client surface isn't needed — only what the service
    // actually touches. Cast as the SDK type for the mock contract.
  } as unknown as ReturnType<typeof getAnthropic>);
  mockParse.mockResolvedValue({
    parsed_output: profile,
    stop_reason: "end_turn",
  });
}

const baseInput: FastOnboardingFormInput = {
  titles: [
    { format: "movie", titles: ["Aftersun", "Past Lives", "Mishima"] },
    { format: "game", titles: ["Disco Elysium"] },
  ],
  pacing: "slow-burn",
  complexity: "layered",
  tone: ["bittersweet"],
  endings: "ambiguous over neat",
  avoidancePatterns: ["chosen-one plots"],
  dislikedTitles: ["Ready Player One"],
  enabledFormats: ["movie", "game", "book"],
};

describe("extractProfileFromForm", () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockedGetAnthropic.mockReset();
  });

  it("returns a parseable profile for a valid form payload", async () => {
    setModelResponse(makeProfile());

    const result = await extractProfileFromForm(baseInput);

    expect(result.themes).toHaveLength(1);
    expect(result.narrativePrefs.pacing).toBe("slow-burn");
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("drops mediaAffinities entries the user disabled", async () => {
    // Model proposes anime even though user didn't enable it. Server overlay
    // must drop the entry — the format-disable rule is a server-enforced
    // contract, not just a prompt convention.
    setModelResponse(
      makeProfile({
        mediaAffinities: [
          { format: "movie", comfort: 0.85, favorites: ["Aftersun"] },
          { format: "anime", comfort: 0.6, favorites: ["Vinland Saga"] },
        ],
      }),
    );

    const result = await extractProfileFromForm({
      ...baseInput,
      enabledFormats: ["movie"],
    });

    const formats = result.mediaAffinities.map((a) => a.format);
    expect(formats).toContain("movie");
    expect(formats).not.toContain("anime");
  });

  it("synthesizes empty mediaAffinities for enabled formats the model skipped", async () => {
    // User enabled book + game; model only returned a movie entry. Overlay
    // should fill in book + game entries derived from titles.
    setModelResponse(
      makeProfile({
        mediaAffinities: [
          { format: "movie", comfort: 0.85, favorites: ["Aftersun"] },
        ],
      }),
    );

    const result = await extractProfileFromForm({
      ...baseInput,
      enabledFormats: ["movie", "game", "book"],
    });

    const byFormat = new Map(result.mediaAffinities.map((a) => [a.format, a]));
    expect(byFormat.has("movie")).toBe(true);
    expect(byFormat.has("game")).toBe(true);
    // book was enabled but no titles — synthesized at low comfort
    expect(byFormat.has("book")).toBe(true);
    expect(byFormat.get("book")?.comfort).toBe(0.3);
    // game had 1 title → 0.6 comfort
    expect(byFormat.get("game")?.comfort).toBe(0.6);
  });

  it("throws if the model returns no parsed_output", async () => {
    mockedGetAnthropic.mockReturnValue({
      messages: { parse: mockParse },
    } as unknown as ReturnType<typeof getAnthropic>);
    mockParse.mockResolvedValue({
      parsed_output: null,
      stop_reason: "max_tokens",
    });

    await expect(extractProfileFromForm(baseInput)).rejects.toThrow(
      /did not return a parseable profile/,
    );
  });
});
