ALTER TABLE "library_items" ADD COLUMN "fit_note" text;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "taste_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "annotated_at_profile_version" integer;