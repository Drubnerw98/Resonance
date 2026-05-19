/**
 * Read-only database client for the eval. Same neon-http driver the server
 * uses, but with a minimal schema definition — we only need the columns the
 * invariants and the recall harness actually read, so we don't import
 * apps/server (which would drag in env/Clerk/Anthropic and require running
 * the eval through the server's boot path).
 *
 * If schema drift becomes a problem, lift the table definitions into a
 * shared package. For now, the columns referenced here are the stable
 * "load-bearing" ones — title, mediaType, cross-references, profileData,
 * tasteTags — that haven't churned since the project's early weeks.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  MediaItem,
  TasteProfile,
} from "@resonance/shared";
import { env } from "./env.js";

const mediaTypeEnum = pgEnum("media_type", [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

export interface CrossReference {
  title: string;
  reason: string;
}

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
});

export const tasteProfiles = pgTable("taste_profiles", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  currentVersion: integer("current_version").notNull(),
  profileData: jsonb("profile_data").$type<TasteProfile>().notNull(),
});

export const mediaCache = pgTable("media_cache", {
  id: uuid("id").primaryKey(),
  mediaType: mediaTypeEnum("media_type").notNull(),
  title: text("title").notNull(),
  normalizedData: jsonb("normalized_data").$type<MediaItem>().notNull(),
});

export const recommendationBatches = pgTable("recommendation_batches", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  name: text("name"),
  prompt: text("prompt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  mediaCacheId: uuid("media_cache_id").notNull(),
  matchScore: integer("match_score").notNull(),
  explanation: text("explanation").notNull(),
  tasteTags: text("taste_tags").array(),
  crossReferences: jsonb("cross_references").$type<CrossReference[]>(),
});

export const libraryItems = pgTable("library_items", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  mediaType: mediaTypeEnum("media_type").notNull(),
  title: text("title").notNull(),
  rating: integer("rating"),
  status: text("status").notNull(),
  fitNote: text("fit_note"),
  tasteTags: text("taste_tags").array(),
});

// Relations let us use the .findMany({ with: ... }) shape for joins.
// Drizzle's relational query needs BOTH sides of a one/many declared so it
// can infer the FK direction — declaring just one side throws at runtime.
export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  media: one(mediaCache, {
    fields: [recommendations.mediaCacheId],
    references: [mediaCache.id],
  }),
  batch: one(recommendationBatches, {
    fields: [recommendations.batchId],
    references: [recommendationBatches.id],
  }),
}));

export const batchRelations = relations(recommendationBatches, ({ many }) => ({
  recommendations: many(recommendations),
}));

const schema = {
  users,
  tasteProfiles,
  mediaCache,
  recommendationBatches,
  recommendations,
  libraryItems,
  recommendationsRelations,
  batchRelations,
};

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export type Database = typeof db;
