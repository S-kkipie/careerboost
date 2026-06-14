CREATE TABLE "ingested_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gmail_msg_id" text NOT NULL,
	"job_id" uuid,
	"noise_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingested_messages_user_msg_unique" UNIQUE("user_id","gmail_msg_id")
);
--> statement-breakpoint
ALTER TABLE "ingested_messages" ADD CONSTRAINT "ingested_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingested_messages" ADD CONSTRAINT "ingested_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingested_messages_user_id_idx" ON "ingested_messages" USING btree ("user_id");