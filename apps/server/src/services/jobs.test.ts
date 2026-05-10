import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const insertReturning = vi.fn();
const queryFindFirst = vi.fn();

vi.mock("../db/index.js", () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () => insertReturning(),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    }),
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve([]) }),
    }),
    query: { jobs: { findFirst: () => queryFindFirst() } },
  },
}));

import { startJob } from "./jobs.js";

describe("startJob unique-violation collapse", () => {
  beforeEach(() => {
    insertReturning.mockReset();
    queryFindFirst.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses two simultaneous starts into the same job", async () => {
    const winnerRow = {
      id: "job-winner",
      userId: "u1",
      kind: "recommendations.generate",
      status: "running" as const,
      startedAt: new Date(),
      heartbeatAt: new Date(),
      completedAt: null,
      error: null,
      result: null,
    };

    insertReturning
      .mockResolvedValueOnce([winnerRow])
      .mockRejectedValueOnce(
        Object.assign(new Error("unique violation"), { code: "23505" }),
      );

    queryFindFirst.mockResolvedValue(winnerRow);

    const work = vi.fn(async () => "ok");
    const [a, b] = await Promise.all([
      startJob({ userId: "u1", kind: "recommendations.generate", work }),
      startJob({ userId: "u1", kind: "recommendations.generate", work }),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.id).toBe("job-winner");
  });

  it("re-throws non-unique-violation errors from insert", async () => {
    insertReturning.mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      startJob({ userId: "u1", kind: "x", work: async () => "ok" }),
    ).rejects.toThrow("connection lost");
  });
});
