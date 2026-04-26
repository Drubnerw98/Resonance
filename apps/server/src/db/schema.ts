import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  MediaItem,
  TasteProfile,
  OnboardingMessage,
} from "@resonance/shared";

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "pending",
  "in_progress",
  "complete",
]);

export const onboardingSessionStatusEnum = pgEnum("onboarding_session_status", [
  "active",
  "completed",
  "abandoned",
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "pending",
  "seen",
  "saved",
  "skipped",
  "rated",
]);

export const mediaSourceEnum = pgEnum("media_source", [
  "tmdb",
  "igdb",
  "jikan",
  "openlibrary",
]);

export const mediaTypeEnum = pgEnum("media_type", [
  "movie",
  "tv",
  "anime",
  "manga",
  "game",
  "book",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    onboardingStatus: onboardingStatusEnum("onboarding_status")
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const tasteProfiles = pgTable(
  "taste_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currentVersion: integer("current_version").notNull().default(1),
    profileData: jsonb("profile_data").$type<TasteProfile>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("taste_profiles_user_id_uniq").on(t.userId)],
);

export const profileVersions = pgTable(
  "profile_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => tasteProfiles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    profileData: jsonb("profile_data").$type<TasteProfile>().notNull(),
    trigger: text("trigger").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("profile_versions_profile_id_idx").on(t.profileId),
    uniqueIndex("profile_versions_profile_version_uniq").on(
      t.profileId,
      t.versionNumber,
    ),
  ],
);

export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: onboardingSessionStatusEnum("status").notNull().default("active"),
    messages: jsonb("messages")
      .$type<OnboardingMessage[]>()
      .notNull()
      .default([]),
    turnCount: integer("turn_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("onboarding_sessions_user_id_idx").on(t.userId)],
);

export const mediaCache = pgTable(
  "media_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull(),
    source: mediaSourceEnum("source").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    title: text("title").notNull(),
    normalizedData: jsonb("normalized_data").$type<MediaItem>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("media_cache_source_external_uniq").on(t.source, t.externalId),
    index("media_cache_media_type_idx").on(t.mediaType),
  ],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull(),
    mediaCacheId: uuid("media_cache_id")
      .notNull()
      .references(() => mediaCache.id, { onDelete: "restrict" }),
    matchScore: doublePrecision("match_score").notNull(),
    explanation: text("explanation").notNull(),
    tasteTags: text("taste_tags").array().notNull().default([]),
    status: recommendationStatusEnum("status").notNull().default("pending"),
    rating: integer("rating"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actedAt: timestamp("acted_at", { withTimezone: true }),
  },
  (t) => [
    index("recommendations_user_id_idx").on(t.userId),
    index("recommendations_batch_id_idx").on(t.batchId),
    index("recommendations_status_idx").on(t.status),
    uniqueIndex("recommendations_user_media_uniq").on(t.userId, t.mediaCacheId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  tasteProfile: one(tasteProfiles, {
    fields: [users.id],
    references: [tasteProfiles.userId],
  }),
  onboardingSessions: many(onboardingSessions),
  recommendations: many(recommendations),
}));

export const tasteProfilesRelations = relations(
  tasteProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [tasteProfiles.userId],
      references: [users.id],
    }),
    versions: many(profileVersions),
  }),
);

export const profileVersionsRelations = relations(profileVersions, ({ one }) => ({
  profile: one(tasteProfiles, {
    fields: [profileVersions.profileId],
    references: [tasteProfiles.id],
  }),
}));

export const onboardingSessionsRelations = relations(
  onboardingSessions,
  ({ one }) => ({
    user: one(users, {
      fields: [onboardingSessions.userId],
      references: [users.id],
    }),
  }),
);

export const mediaCacheRelations = relations(mediaCache, ({ many }) => ({
  recommendations: many(recommendations),
}));

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  user: one(users, {
    fields: [recommendations.userId],
    references: [users.id],
  }),
  media: one(mediaCache, {
    fields: [recommendations.mediaCacheId],
    references: [mediaCache.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TasteProfileRow = typeof tasteProfiles.$inferSelect;
export type NewTasteProfileRow = typeof tasteProfiles.$inferInsert;
export type ProfileVersion = typeof profileVersions.$inferSelect;
export type NewProfileVersion = typeof profileVersions.$inferInsert;
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type NewOnboardingSession = typeof onboardingSessions.$inferInsert;
export type MediaCacheRow = typeof mediaCache.$inferSelect;
export type NewMediaCacheRow = typeof mediaCache.$inferInsert;
export type RecommendationRow = typeof recommendations.$inferSelect;
export type NewRecommendationRow = typeof recommendations.$inferInsert;
