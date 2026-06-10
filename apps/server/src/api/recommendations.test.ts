import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { User } from "../db/schema.js";

// Pins the IDOR fix on the batch routes: ownership must be enforced inside
// the WHERE clause (id AND userId), not checked on the returned row after
// the mutation already ran. A cross-user request matches zero rows → 404.

let capturedUpdateWhere: SQL | undefined;
let capturedDeleteWhere: SQL | undefined;

vi.mock("../db/index.js", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: (cond: SQL) => {
          capturedUpdateWhere = cond;
          return { returning: () => Promise.resolve([]) };
        },
      }),
    }),
    delete: () => ({
      where: (cond: SQL) => {
        capturedDeleteWhere = cond;
        return { returning: () => Promise.resolve([]) };
      },
    }),
  },
}));

const requester: User = {
  id: "11111111-1111-4111-8111-111111111111",
  clerkId: "clerk_requester",
  email: "requester@example.com",
  displayName: "Requester",
  onboardingStatus: "complete",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

vi.mock("../middleware/auth.js", () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    req.user = requester;
    next();
  },
}));

// The router pulls in the whole generation pipeline; none of it runs in
// these tests, but the imports would drag in env validation + the
// Anthropic client at module load.
vi.mock("../services/ai/recommender.js", () => ({
  generateRecommendations: vi.fn(),
  rescoreRecommendation: vi.fn(),
}));
vi.mock("../services/jobs.js", () => ({
  findActiveJobForUser: vi.fn(),
  getJob: vi.fn(),
  startJob: vi.fn(),
}));
vi.mock("../services/rateLimit.js", () => ({ checkRateLimit: vi.fn() }));
vi.mock("../services/mediaCache.js", () => ({ enrichWithRuntime: vi.fn() }));

import { recommendationsRouter } from "./recommendations.js";

// A batch id the requester does not own — the mocked WHERE matches no rows.
const FOREIGN_BATCH_ID = "22222222-2222-4222-8222-222222222222";

const dialect = new PgDialect();

async function request(method: "PATCH" | "DELETE", path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/api/recommendations", recommendationsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a TCP port");
  }
  try {
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/recommendations${path}`,
      {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return { status: res.status, body: (await res.json()) as unknown };
  } finally {
    server.close();
  }
}

describe("batch mutations are scoped to the requesting user", () => {
  beforeEach(() => {
    capturedUpdateWhere = undefined;
    capturedDeleteWhere = undefined;
  });

  it("PATCH /batches/:id puts userId in the WHERE clause and 404s on no match", async () => {
    const res = await request("PATCH", `/batches/${FOREIGN_BATCH_ID}`, {
      name: "hijacked",
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "batch not found" });

    const query = dialect.sqlToQuery(capturedUpdateWhere!);
    expect(query.sql).toContain('"user_id"');
    expect(query.params).toContain(requester.id);
    expect(query.params).toContain(FOREIGN_BATCH_ID);
  });

  it("DELETE /batches/:id puts userId in the WHERE clause and 404s on no match", async () => {
    const res = await request("DELETE", `/batches/${FOREIGN_BATCH_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "batch not found" });

    const query = dialect.sqlToQuery(capturedDeleteWhere!);
    expect(query.sql).toContain('"user_id"');
    expect(query.params).toContain(requester.id);
    expect(query.params).toContain(FOREIGN_BATCH_ID);
  });
});
