# Spec 02 — Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the domain Drizzle schema (`profiles`, `jobs`, `matches`, `ingestion_runs`) with `vector(768)` embedding columns + an HNSW cosine index, and migrate it into Postgres with the pgvector extension enabled by the migration.

**Architecture:** One focused Drizzle schema file per table under `src/server/drizzle/schemas/`, re-exported through the existing `schemas/index.ts` barrel (which already re-exports `auth-schema`). The DB client (`db.ts`) and `drizzle.config.ts` already consume the barrel, so new tables are picked up automatically. Embeddings use Drizzle's native `vector` column (`drizzle-orm/pg-core`); similarity later uses `cosineDistance` (`drizzle-orm`). Every domain table FKs to the Better Auth `user` table with `onDelete: cascade` and carries `user_id` for per-user isolation.

**Tech Stack:** Drizzle ORM 0.45.x (`vector`, `index().using("hnsw", ...op("vector_cosine_ops"))`), Postgres + pgvector (dev container on :5433), drizzle-kit migrations.

**Spec:** `docs/superpowers/specs/2026-06-13-spec-02-data-model.md`

---

## Decisions / notes (review first)

- **Column identifiers:** camelCase in Drizzle, snake_case in the DB (matches the generated `auth-schema`). e.g. `escuelaProfesional` → `escuela_profesional`.
- **`grado` and `matches.status` are `text`, not pg enums** (YAGNI — MVP targets egresados; values documented in comments). Easy to promote to enums later.
- **Embedding columns are nullable** — a profile/job exists before its embedding is computed (Spec 03/04 fill them). `vector("embedding", { dimensions: 768 })`.
- **HNSW cosine index on `jobs.embedding` only** — that's the table queried by similarity (Spec 05). `profiles` has one row per user (queried by `user_id`), so no vector index there.
- **pgvector extension:** Drizzle does NOT create it. The dev DB already has it (`pnpm db:init` from Spec 00), but to keep migrations self-contained for CI/prod, the domain migration prepends `CREATE EXTENSION IF NOT EXISTS vector;` (AGENTS.md requires enabling it in a migration before any vector column).
- **No custom distance helper** — `cosineDistance(col, vec)` from `drizzle-orm` is built-in; Spec 05 uses it directly. This spec only delivers schema + migration + inferred types.
- **Inferred types exported** (`Profile`/`NewProfile`, `Job`/`NewJob`, `Match`/`NewMatch`, `IngestionRun`/`NewIngestionRun`) for Specs 03-05.

---

### Task 1: Domain schema files + barrel + inferred types

**Files:**
- Create: `src/server/drizzle/schemas/profiles.ts`, `src/server/drizzle/schemas/jobs.ts`, `src/server/drizzle/schemas/matches.ts`, `src/server/drizzle/schemas/ingestion-runs.ts`
- Modify: `src/server/drizzle/schemas/index.ts`

- [ ] **Step 1: Create `src/server/drizzle/schemas/profiles.ts`** (one profile per user; `user_id` is the PK)

```ts
import { integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const profiles = pgTable("profiles", {
    userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    escuelaProfesional: text("escuela_profesional"),
    grado: text("grado"), // egresado | bachiller | titulado (MVP: egresado)
    ubicacion: text("ubicacion"),
    intereses: text("intereses").array(),
    expectativaSalarial: integer("expectativa_salarial"),
    cvUrl: text("cv_url"),
    rawCvText: text("raw_cv_text"),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
```

- [ ] **Step 2: Create `src/server/drizzle/schemas/jobs.ts`** (vacancies from a user's inbox; vector + HNSW + dedupe constraints)

```ts
import {
    boolean,
    date,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    vector,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        gmailMsgId: text("gmail_msg_id").notNull(),
        sourceSender: text("source_sender"),
        titulo: text("titulo"),
        empresa: text("empresa"),
        modalidad: text("modalidad"), // presencial | remoto | hibrido
        ubicacion: text("ubicacion"),
        salarioMin: integer("salario_min"),
        salarioMax: integer("salario_max"),
        moneda: text("moneda"), // PEN | USD
        salarioPeriodo: text("salario_periodo"), // mes | hora | anio
        salarioExplicito: boolean("salario_explicito").notNull().default(false),
        requisitos: text("requisitos"),
        skills: text("skills").array(),
        deadline: date("deadline"),
        applyLink: text("apply_link"),
        rawEmail: text("raw_email"),
        isJob: boolean("is_job").notNull().default(true),
        noiseReason: text("noise_reason"),
        dedupeHash: text("dedupe_hash").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("jobs_user_gmail_msg_unique").on(table.userId, table.gmailMsgId),
        unique("jobs_user_dedupe_unique").on(table.userId, table.dedupeHash),
        index("jobs_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
        index("jobs_user_id_idx").on(table.userId),
    ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
```

- [ ] **Step 3: Create `src/server/drizzle/schemas/matches.ts`** (per user/job match result)

```ts
import {
    index,
    integer,
    jsonb,
    pgTable,
    real,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { jobs } from "./jobs";

export const matches = pgTable(
    "matches",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        jobId: uuid("job_id")
            .notNull()
            .references(() => jobs.id, { onDelete: "cascade" }),
        score: real("score"),
        rerankScore: integer("rerank_score"),
        explanation: text("explanation"),
        flags: jsonb("flags"),
        status: text("status").notNull().default("new"), // new | seen | saved | dismissed
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("matches_user_job_unique").on(table.userId, table.jobId),
        index("matches_user_id_idx").on(table.userId),
    ],
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
```

- [ ] **Step 4: Create `src/server/drizzle/schemas/ingestion-runs.ts`** (metrics for the impact panel)

```ts
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const ingestionRuns = pgTable(
    "ingestion_runs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        startedAt: timestamp("started_at").notNull().defaultNow(),
        finishedAt: timestamp("finished_at"),
        emailsScanned: integer("emails_scanned").notNull().default(0),
        jobsFound: integer("jobs_found").notNull().default(0),
        noiseFiltered: integer("noise_filtered").notNull().default(0),
        dupesRemoved: integer("dupes_removed").notNull().default(0),
    },
    (table) => [index("ingestion_runs_user_id_idx").on(table.userId)],
);

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
```

- [ ] **Step 5: Extend the barrel `src/server/drizzle/schemas/index.ts`**

```ts
export * from "./auth-schema";
export * from "./profiles";
export * from "./jobs";
export * from "./matches";
export * from "./ingestion-runs";
```

- [ ] **Step 6: Verify it type-checks**

Run: `pnpm check` (biome + tsc)
Expected: no errors. (Schema only; no migration yet. The `db` client now includes these tables in its schema namespace.)
If `vector`, `.op("vector_cosine_ops")`, or `.array()` is typed differently in the installed Drizzle 0.45.x, adjust to the installed API and report — do NOT use type suppression.

- [ ] **Step 7: Commit**

```bash
git add src/server/drizzle/schemas
git commit -m "feat: domain Drizzle schema (profiles, jobs, matches, ingestion_runs)"
```
(Append a blank line + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` to every commit.)

---

### Task 2: Migrate (enable pgvector) + verify vectors end-to-end

**Files:**
- Create: `drizzle/0001_*.sql` (+ meta snapshot/journal, by drizzle-kit), `src/server/drizzle/schema.test.ts`
- Modify: the generated `drizzle/0001_*.sql` (prepend the extension statement)

- [ ] **Step 1: Generate the migration**

Run: `pnpm db:generate`
Expected: a new migration `drizzle/0001_<name>.sql` creating `profiles`, `jobs`, `matches`, `ingestion_runs` with their FKs, unique constraints, the `jobs_embedding_idx` HNSW index, and the btree user_id indexes; plus updated `drizzle/meta/`.

- [ ] **Step 2: Prepend the pgvector extension to the generated migration**

Edit the new `drizzle/0001_*.sql` so its FIRST statement enables the extension (Drizzle won't add it, and the `jobs`/`profiles` vector columns need it):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
```
(Leave the rest of the generated SQL unchanged. This is a one-time committed edit; future `db:generate` runs create separate migration files and won't touch this one.)

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: applies cleanly to the :5433 DB (extension already present from `db:init`, so the `CREATE EXTENSION IF NOT EXISTS` is a no-op there; on a fresh DB it creates it).

- [ ] **Step 4: Verify tables + the HNSW index exist**

Run:
```bash
pnpm dlx tsx --env-file=.env.local -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const t=await sql\`select tablename from pg_tables where schemaname='public' order by tablename\`; const i=await sql\`select indexname, indexdef from pg_indexes where schemaname='public' and indexname='jobs_embedding_idx'\`; console.log('tables', t.map(x=>x.tablename)); console.log('hnsw', i); await sql.end();"
```
Expected: tables include `profiles`, `jobs`, `matches`, `ingestion_runs` (plus the auth tables); `jobs_embedding_idx` exists with `USING hnsw (embedding vector_cosine_ops)`.

- [ ] **Step 5: Write an integration test** — `src/server/drizzle/schema.test.ts` (proves vector(768) + cosine ordering + FK cascade against the dev DB; cleans up after itself)

```ts
import { and, eq } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { user } from "@/server/drizzle/schemas/auth-schema";

const TEST_USER_ID = "spec02-vector-test-user";

function vec(seed: number): number[] {
    // deterministic 768-dim unit-ish vector
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

describe("domain schema vectors", () => {
    afterAll(async () => {
        // cascade deletes the test jobs too
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("stores vector(768) and orders jobs by cosine distance", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Vector Test",
            email: "spec02-vector-test@example.com",
            emailVerified: false,
        });
        await db.insert(jobs).values([
            {
                userId: TEST_USER_ID,
                gmailMsgId: "m-near",
                dedupeHash: "h-near",
                titulo: "near",
                embedding: vec(0),
            },
            {
                userId: TEST_USER_ID,
                gmailMsgId: "m-far",
                dedupeHash: "h-far",
                titulo: "far",
                embedding: vec(5),
            },
        ]);

        const query = vec(0);
        const rows = await db
            .select({ titulo: jobs.titulo })
            .from(jobs)
            .where(eq(jobs.userId, TEST_USER_ID))
            .orderBy(cosineDistance(jobs.embedding, query))
            .limit(1);

        expect(rows[0]?.titulo).toBe("near");
    });
});
```
NOTES:
- This test mutates the dev DB but cleans up via `afterAll` (cascade through the FK). It requires the :5433 DB running (it is; `test-setup.ts` loads `.env.local`/`.env.example`).
- If `user.emailVerified` is non-nullable without a default in the generated `auth-schema`, pass `emailVerified: false` (shown). If insert fails on a missing required `user` column, read `auth-schema.ts` and supply it; report.
- If the `embedding` insert type expects a string rather than `number[]`, use the form the installed Drizzle requires (it accepts `number[]` for `vector`); report any adjustment. No type suppression.

- [ ] **Step 6: Run the test + full check**

Run: `pnpm test` → expect all pass (existing 3 + this one).
Run: `pnpm check` (biome + tsc) → clean.
Run: `pnpm build` → pass.

- [ ] **Step 7: Commit**

```bash
git add drizzle/ src/server/drizzle/schema.test.ts
git commit -m "feat: migrate domain schema with pgvector + vector round-trip test"
```

---

## Self-Review

**Spec coverage (spec-02 → task):**
- Drizzle schema with `vector(768)` for `profiles`, `jobs`, `matches`, `ingestion_runs` → Task 1 ✅
- `unique(user_id, gmail_msg_id)` + `unique(user_id, dedupe_hash)` on jobs → Task 1 (jobs.ts) ✅
- HNSW cosine index on `jobs.embedding`; btree indexes on `user_id` → Task 1 ✅
- pgvector extension enabled in a migration before vector columns → Task 2 Step 2 ✅
- Migrations applied; tables + index exist → Task 2 Steps 3-4 ✅
- vector(768) round-trips + cosine ordering works → Task 2 Step 5 test ✅
- Per-user isolation (every table has `user_id` FK cascade) → Task 1 ✅
- Inferred types for later specs → Task 1 (each file exports `$inferSelect`/`$inferInsert`) ✅

**Placeholder scan:** none. Every step has full code/commands.

**Type consistency:** `vector("embedding", { dimensions: 768 })` used identically in profiles + jobs. `cosineDistance` imported from `drizzle-orm` (not pg-core). `user` imported from `./auth-schema`, `jobs` from `./jobs` (matches FK). Barrel re-exports all new files; `db.ts`/`drizzle.config.ts` already point at the barrel (no change needed). Table export names (`profiles`, `jobs`, `matches`, `ingestionRuns`) match their imports in the test and later specs.

**Risk flags (verify against installed Drizzle 0.45.x; no suppression):** `vector` column + `.op("vector_cosine_ops")` HNSW syntax (Task 1); `cosineDistance` accepting `number[]` and the `vector` insert accepting `number[]` (Task 2 test); required `user` columns for the test insert (read auth-schema).

**Out of scope (later specs):** filling embeddings (Spec 03 profile CV, Spec 04 jobs); the retrieval/rerank query using `cosineDistance` (Spec 05); any UI (Spec 06).
