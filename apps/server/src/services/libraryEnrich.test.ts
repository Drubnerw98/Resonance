import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Pins the enrichment retry stamp (docs/followups.md 2026-05-11): a failed
// adapter lookup must stamp media_cache_enrich_tried_at, and the drain must
// skip rows stamped within the last 7 days — otherwise un-enrichable titles
// re-burn adapter budget on every /watchlist visit.

let selectRows: unknown[] = [];
let capturedSelectWhere: SQL | undefined;
let capturedUpdateSet: Record<string, unknown> | undefined;
let capturedUpdateWhere: SQL | undefined;

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: SQL) => {
          capturedSelectWhere = cond;
          return { limit: () => Promise.resolve(selectRows) };
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (cond: SQL) => {
          capturedUpdateSet = values;
          capturedUpdateWhere = cond;
          return Promise.resolve([]);
        },
      }),
    }),
  },
}));

vi.mock("./mediaCache.js", () => ({
  searchAndCacheByTitle: vi.fn(async () => []),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  enrichLibraryItem,
  enrichLibraryItemsForUser,
} from "./libraryEnrich.js";

const dialect = new PgDialect();

describe("enrichment retry stamp", () => {
  beforeEach(() => {
    selectRows = [];
    capturedSelectWhere = undefined;
    capturedUpdateSet = undefined;
    capturedUpdateWhere = undefined;
  });

  it("stamps media_cache_enrich_tried_at when the adapter finds nothing", async () => {
    selectRows = [
      {
        id: "item-1",
        userId: "user-1",
        title: "Extremely Obscure Indie Game",
        mediaType: "game",
        mediaCacheId: null,
        year: null,
      },
    ];

    await enrichLibraryItem("item-1");

    expect(capturedUpdateSet).toBeDefined();
    expect(capturedUpdateSet!.mediaCacheEnrichTriedAt).toBeInstanceOf(Date);
    const where = dialect.sqlToQuery(capturedUpdateWhere!);
    expect(where.params).toContain("item-1");
  });

  it("drain filters out rows whose failed attempt is younger than 7 days", async () => {
    await enrichLibraryItemsForUser("user-1");

    const query = dialect.sqlToQuery(capturedSelectWhere!);
    expect(query.sql).toContain('"user_id"');
    expect(query.sql).toContain('"media_cache_enrich_tried_at"');
    expect(query.params).toContain("user-1");
    // The retry cutoff sits ~7 days in the past. Match ISO-shaped params
    // only — V8's lenient Date.parse would otherwise read a year out of
    // "user-1".
    const cutoff = query.params
      .filter(
        (p): p is string =>
          typeof p === "string" && /^\d{4}-\d{2}-\d{2}/.test(p),
      )
      .map((p) => Date.parse(p))
      .find((t) => !Number.isNaN(t));
    expect(cutoff).toBeDefined();
    const ageDays = (Date.now() - cutoff!) / 86_400_000;
    expect(ageDays).toBeGreaterThan(6.9);
    expect(ageDays).toBeLessThan(7.1);
  });
});
