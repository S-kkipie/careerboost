TRUNCATE TABLE "matches", "jobs", "ingestion_runs" RESTART IDENTITY CASCADE;
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_user_gmail_msg_unique";--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_user_dedupe_unique";--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "jobs_user_id_idx";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "gmail_msg_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "is_job";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "noise_reason";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_dedupe_unique" UNIQUE("dedupe_hash");