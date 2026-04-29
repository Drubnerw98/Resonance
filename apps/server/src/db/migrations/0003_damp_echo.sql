CREATE TABLE "discovery_themes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"themes" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_themes" ADD CONSTRAINT "discovery_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;