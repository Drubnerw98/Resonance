CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"source" text NOT NULL,
	"rating" integer,
	"year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_items_user_id_idx" ON "library_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_items_user_title_uniq" ON "library_items" USING btree ("user_id","media_type","title");