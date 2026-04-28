CREATE TABLE "recommendation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_batches" ADD CONSTRAINT "recommendation_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_batches_user_id_idx" ON "recommendation_batches" USING btree ("user_id");--> statement-breakpoint
-- Backfill: every existing distinct (batch_id, user_id) in recommendations
-- becomes a row in recommendation_batches. Preserves the original UUID so
-- the FK below validates against existing data. created_at takes the
-- earliest createdAt of the recs in that batch.
INSERT INTO "recommendation_batches" ("id", "user_id", "created_at", "updated_at")
SELECT
  "batch_id",
  "user_id",
  MIN("created_at"),
  MIN("created_at")
FROM "recommendations"
GROUP BY "batch_id", "user_id";
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_batch_id_recommendation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."recommendation_batches"("id") ON DELETE cascade ON UPDATE no action;
