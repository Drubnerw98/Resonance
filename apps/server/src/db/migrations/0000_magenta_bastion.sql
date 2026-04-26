CREATE TYPE "public"."media_source" AS ENUM('tmdb', 'igdb', 'jikan', 'openlibrary');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv', 'anime', 'manga', 'game', 'book');--> statement-breakpoint
CREATE TYPE "public"."onboarding_session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('pending', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'seen', 'saved', 'skipped', 'rated');--> statement-breakpoint
CREATE TABLE "media_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source" "media_source" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "onboarding_session_status" DEFAULT 'active' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"profile_data" jsonb NOT NULL,
	"trigger" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"media_cache_id" uuid NOT NULL,
	"match_score" double precision NOT NULL,
	"explanation" text NOT NULL,
	"taste_tags" text[] DEFAULT '{}' NOT NULL,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taste_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"profile_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"onboarding_status" "onboarding_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_profile_id_taste_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."taste_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_media_cache_id_media_cache_id_fk" FOREIGN KEY ("media_cache_id") REFERENCES "public"."media_cache"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_cache_source_external_uniq" ON "media_cache" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "media_cache_media_type_idx" ON "media_cache" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "onboarding_sessions_user_id_idx" ON "onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_versions_profile_id_idx" ON "profile_versions" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_versions_profile_version_uniq" ON "profile_versions" USING btree ("profile_id","version_number");--> statement-breakpoint
CREATE INDEX "recommendations_user_id_idx" ON "recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendations_batch_id_idx" ON "recommendations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "recommendations_status_idx" ON "recommendations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_user_media_uniq" ON "recommendations" USING btree ("user_id","media_cache_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taste_profiles_user_id_uniq" ON "taste_profiles" USING btree ("user_id");