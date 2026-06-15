ALTER TABLE "ingested_messages" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "ingested_messages" ADD COLUMN "sender" text;--> statement-breakpoint
ALTER TABLE "ingested_messages" ADD COLUMN "internal_date" timestamp;