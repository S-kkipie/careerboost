CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"emails_scanned" integer DEFAULT 0 NOT NULL,
	"jobs_found" integer DEFAULT 0 NOT NULL,
	"noise_filtered" integer DEFAULT 0 NOT NULL,
	"dupes_removed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gmail_msg_id" text NOT NULL,
	"source_sender" text,
	"titulo" text,
	"empresa" text,
	"modalidad" text,
	"ubicacion" text,
	"salario_min" integer,
	"salario_max" integer,
	"moneda" text,
	"salario_periodo" text,
	"salario_explicito" boolean DEFAULT false NOT NULL,
	"requisitos" text,
	"skills" text[],
	"deadline" date,
	"apply_link" text,
	"raw_email" text,
	"is_job" boolean DEFAULT true NOT NULL,
	"noise_reason" text,
	"dedupe_hash" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_user_gmail_msg_unique" UNIQUE("user_id","gmail_msg_id"),
	CONSTRAINT "jobs_user_dedupe_unique" UNIQUE("user_id","dedupe_hash")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"score" real,
	"rerank_score" integer,
	"explanation" text,
	"flags" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matches_user_job_unique" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"escuela_profesional" text,
	"grado" text,
	"ubicacion" text,
	"intereses" text[],
	"expectativa_salarial" integer,
	"cv_url" text,
	"raw_cv_text" text,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_runs_user_id_idx" ON "ingestion_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_embedding_idx" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "jobs_user_id_idx" ON "jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_user_id_idx" ON "matches" USING btree ("user_id");