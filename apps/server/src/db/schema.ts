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
  DiscoveryTheme,
  MediaItem,
  OnboardingMessage,
  TasteProfile,
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
  // "I plan to consume this" — adds the rec's media to the user's watchlist
  // and excludes it from future candidate pools (without treating it as
  // negative signal).
  "plan_to",
]);

// Library items can represent either things the user has actually engaged
// with ("consumed") or things they intend to engage with ("watchlist"). The
// recommender pulls cross-references from `consumed` only — watchlist items
// haven't been experienced, so explanations like "the same X you found in Y"
// would be wrong. But watchlist items DO contribute to the dedup pool so
// they aren't re-recommended.
export const libraryItemStatusEnum = pgEnum("library_item_status", [
  "consumed",
  "watchlist",
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

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const users = pgTable("users", {
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
});

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

// User-curated library entries — works the user has explicitly told the
// system they've engaged with positively. Two main sources:
//   - Imported from external services (Letterboxd CSV, Goodreads, etc.)
//   - Added manually
// Distinct from `recommendations` rows (which are AI-generated suggestions
// the user reacted to) and from profile.mediaAffinities[].favorites (which
// were inferred during onboarding extraction). The recommender's
// "library" feed pulls from all three.
export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    /** "letterboxd" | "goodreads" | "manual" | etc. */
    source: text("source").notNull(),
    /** "consumed" (default) for things the user has watched/read/played;
     * "watchlist" for plan-to-consume entries. Default catches every existing
     * row from before this column existed. */
    status: libraryItemStatusEnum("status").notNull().default("consumed"),
    /** Optional 1-5 user rating, when the import provides one. */
    rating: integer("rating"),
    /** Optional release year — stored when import provides it; helps
     * disambiguate same-titled works. */
    year: integer("year"),
    /** AI-generated 1-2 sentence rationale tying THIS specific title to the
     * user's taste profile. Populated for manual+consumed items only;
     * watchlist items and bulk imports stay null. Survives profile
     * refinement (themes drift gradually, fitNotes degrade gracefully);
     * regen would only fire on explicit user action, never lazily. */
    fitNote: text("fit_note"),
    /** Canonical theme/archetype labels (verbatim from profile) the AI
     * judged this title to exemplify. Filtered server-side against the
     * profile's known labels — the model occasionally invents tags.
     * Empty for watchlist items and bulk imports; Constellation's
     * title-substring fallback positions those instead. */
    tasteTags: text("taste_tags").array().notNull().default([]),
    /** Profile version active when fitNote/tasteTags were generated. Lets
     * future regen logic identify stale annotations without timestamp
     * comparisons. NULL for un-annotated rows. */
    annotatedAtProfileVersion: integer("annotated_at_profile_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("library_items_user_id_idx").on(t.userId),
    uniqueIndex("library_items_user_title_uniq").on(
      t.userId,
      t.mediaType,
      t.title,
    ),
  ],
);

// Persistent batches — every generated rec batch becomes a first-class
// object with a name, optional prompt, and timestamp. Lays the groundwork
// for "your lists" UX where users can revisit, rename, and organize batches
// they've generated. Default (no-prompt) batches are still batches; their
// prompt column is just null.
export const recommendationBatches = pgTable(
  "recommendation_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Free-text user prompt that scoped this batch ("a movie that'll make
     * me cry"). Null for the default profile-only batch. */
    prompt: text("prompt"),
    /** Optional user-given name. Falls back to a derived label in the UI. */
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("recommendation_batches_user_id_idx").on(t.userId)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => recommendationBatches.id, { onDelete: "cascade" }),
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

// Browse-mode themes generated from the user's profile. One row per user;
// regenerated on manual refresh or invalidated when the profile changes.
// Stored as a jsonb array (cheap to read/write, max 6-8 entries).
export const discoveryThemes = pgTable("discovery_themes", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  themes: jsonb("themes").$type<DiscoveryTheme[]>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Background job tracker. Used by the recommendation pipeline (long-running
 * AI calls + adapter verification) so the request handler can return 202
 * immediately and the client can poll. Replaces the in-memory Map this used
 * to live in — Postgres-backed so a deploy or process restart doesn't
 * orphan in-flight jobs (boot-time recovery flips them to "failed").
 *
 * `result` is a per-kind JSONB payload that the caller persists when work
 * completes — typed at the call site (`startJob<TResult>`), not here.
 *
 * Currently single-instance only. To make this multi-safe, the worker
 * pickup needs an atomic claim: `UPDATE jobs SET status='running' WHERE
 * id=$1 AND status='pending' RETURNING ...`. We don't run multiple
 * replicas yet, so the simpler "insert with status='running' immediately"
 * path stays — when we scale out, that's the single line to change.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Updated by the worker periodically while running. A row stuck in
     * "running" with a stale heartbeat means the worker died — the boot
     * recovery sweep + the per-tick stale check both rely on this. */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    result: jsonb("result"),
  },
  (t) => [
    index("jobs_user_kind_status_idx").on(t.userId, t.kind, t.status),
    index("jobs_completed_at_idx").on(t.completedAt),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;

export const usersRelations = relations(users, ({ one, many }) => ({
  tasteProfile: one(tasteProfiles, {
    fields: [users.id],
    references: [tasteProfiles.userId],
  }),
  onboardingSessions: many(onboardingSessions),
  recommendations: many(recommendations),
  libraryItems: many(libraryItems),
}));

export const libraryItemsRelations = relations(libraryItems, ({ one }) => ({
  user: one(users, {
    fields: [libraryItems.userId],
    references: [users.id],
  }),
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

export const profileVersionsRelations = relations(
  profileVersions,
  ({ one }) => ({
    profile: one(tasteProfiles, {
      fields: [profileVersions.profileId],
      references: [tasteProfiles.id],
    }),
  }),
);

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

export const recommendationsRelations = relations(
  recommendations,
  ({ one }) => ({
    user: one(users, {
      fields: [recommendations.userId],
      references: [users.id],
    }),
    media: one(mediaCache, {
      fields: [recommendations.mediaCacheId],
      references: [mediaCache.id],
    }),
    batch: one(recommendationBatches, {
      fields: [recommendations.batchId],
      references: [recommendationBatches.id],
    }),
  }),
);

export const recommendationBatchesRelations = relations(
  recommendationBatches,
  ({ one, many }) => ({
    user: one(users, {
      fields: [recommendationBatches.userId],
      references: [users.id],
    }),
    recommendations: many(recommendations),
  }),
);

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
export type RecommendationBatchRow = typeof recommendationBatches.$inferSelect;
export type NewRecommendationBatchRow =
  typeof recommendationBatches.$inferInsert;
export type LibraryItemRow = typeof libraryItems.$inferSelect;
export type NewLibraryItemRow = typeof libraryItems.$inferInsert;
export type DiscoveryThemesRow = typeof discoveryThemes.$inferSelect;
export type NewDiscoveryThemesRow = typeof discoveryThemes.$inferInsert;
