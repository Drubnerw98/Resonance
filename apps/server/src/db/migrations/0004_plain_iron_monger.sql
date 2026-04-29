CREATE TYPE "public"."library_item_status" AS ENUM('consumed', 'watchlist');--> statement-breakpoint
ALTER TYPE "public"."recommendation_status" ADD VALUE 'plan_to';--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "status" "library_item_status" DEFAULT 'consumed' NOT NULL;