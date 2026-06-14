# Shared Global Jobs Pool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the per-user `jobs` table into a single shared global pool of UNSA convocatorias (dedupe global, embed once, every user matches the whole pool), and surface the existing `deadline` in the feed UI.

**Architecture:** `jobs` becomes ownerless public data keyed by a globally-unique `dedupe_hash`. Per-user "which Gmail messages have I processed" moves to a new `ingested_messages` log. Ingestion embeds a convocatoria only when it is brand-new globally. Matching drops the `user_id` filter so retrieval spans the whole pool; `matches` stay private `(userId, jobId)`. Profiles + matches remain per-user. Data is reset (regenerable) rather than migrated.

**Tech Stack:** Next.js 16, Elysia, Drizzle ORM (Postgres + pgvector), `@google/genai` (Gemini embeddings), Vitest (node env, hits a real dev DB), Biome + `tsc`.

**Spec:** `docs/superpowers/specs/2026-06-14-shared-jobs-pool-design.md`

**Verification per task:** `pnpm check` (biome + `tsc --noEmit`) and `pnpm test` (vitest). Service/schema tests hit the configured `DATABASE_URL` (`.env.local`); the schema change must be applied to that DB (`pnpm db:migrate`) before those tests pass. Commit after each task.

---

## File Structure

- `src/server/drizzle/schemas/jobs.ts` — drop per-user columns/constraints, add global dedupe unique.
- `src/server/drizzle/schemas/ingested-messages.ts` — **new** per-user processing log.
- `src/server/drizzle/schemas/index.ts` — export the new schema.
- `src/server/services/ingestion.ts` — global upsert + embed-once + ingested-messages log.
- `src/server/services/matching.ts` — drop user filter in `retrieveCandidates`; add `deadline` to feed select/types/mapper (Task 3).
- `src/server/services/digest.ts` — add `deadline` to the digest select (Task 3).
- `src/frontend/lib/format.ts` — pure `formatDeadline` helper (Task 3).
- `src/frontend/components/feed/match-card.tsx` — render the deadline badge (Task 3).
- `src/frontend/components/landing/product-showcase.tsx` — add `deadline` to the static SAMPLE (Task 3).
- `scripts/seed-demo.ts` — drop per-user job columns.
- `drizzle/000X_*.sql` — generated migrations (Task 1 add table; Task 2 alter jobs + truncate).
- Tests: `ingested-messages` (Task 1), `ingestion.test.ts`, `matching.test.ts`, `dedupe.test.ts`, `schema.test.ts` (Task 2), `format.test.ts`, `digest-email.test.ts` (Task 3).

---

## Task 1: New `ingested_messages` table (additive)

Purely additive — no existing code changes behavior. Leaves build + tests green.

**Files:**
- Create: `src/server/drizzle/schemas/ingested-messages.ts`
- Modify: `src/server/drizzle/schemas/index.ts`
- Create: `src/server/drizzle/ingested-messages.test.ts`
- Generated: `drizzle/0003_*.sql` (+ `meta/`)

- [ ] **Step 1: Create the schema**

`src/server/drizzle/schemas/ingested-messages.ts`:

```ts
import {
    index,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { jobs } from "./jobs";

// Per-user log of processed Gmail messages. The global `jobs` pool holds only
// real convocatorias; this table records, per user, which inbox messages were
// already handled (job -> jobId set; noise -> jobId null + noiseReason).
export const ingestedMessages = pgTable(
    "ingested_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        gmailMsgId: text("gmail_msg_id").notNull(),
        jobId: uuid("job_id").references(() => jobs.id, {
            onDelete: "set null",
        }),
        noiseReason: text("noise_reason"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("ingested_messages_user_msg_unique").on(
            table.userId,
            table.gmailMsgId,
        ),
        index("ingested_messages_user_id_idx").on(table.userId),
    ],
);

export type IngestedMessage = typeof ingestedMessages.$inferSelect;
export type NewIngestedMessage = typeof ingestedMessages.$inferInsert;
```

- [ ] **Step 2: Export it**

Add to `src/server/drizzle/schemas/index.ts` (keep alphabetical-ish ordering with the rest):

```ts
export * from "./ingested-messages";
```

- [ ] **Step 3: Write the failing test**

`src/server/drizzle/ingested-messages.test.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";

const TEST_USER_ID = "spec08-ingmsg-test-user";

describe("ingested_messages table", () => {
    afterAll(async () => {
        // FK user_id is ON DELETE CASCADE, so this clears the rows too.
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("stores per-user processed messages and is unique on (user, msg)", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "IngMsg Test",
            email: "spec08-ingmsg-test@example.com",
            emailVerified: false,
        });

        await db
            .insert(ingestedMessages)
            .values({
                userId: TEST_USER_ID,
                gmailMsgId: "m-1",
                jobId: null,
                noiseReason: "promo",
            })
            .onConflictDoNothing({
                target: [
                    ingestedMessages.userId,
                    ingestedMessages.gmailMsgId,
                ],
            });

        // Same (user, msg) -> conflict -> no second row.
        await db
            .insert(ingestedMessages)
            .values({ userId: TEST_USER_ID, gmailMsgId: "m-1", jobId: null })
            .onConflictDoNothing({
                target: [
                    ingestedMessages.userId,
                    ingestedMessages.gmailMsgId,
                ],
            });

        const rows = await db
            .select({ gmailMsgId: ingestedMessages.gmailMsgId })
            .from(ingestedMessages)
            .where(
                and(
                    eq(ingestedMessages.userId, TEST_USER_ID),
                    inArray(ingestedMessages.gmailMsgId, ["m-1", "m-2"]),
                ),
            );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.gmailMsgId).toBe("m-1");
    });
});
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0003_*.sql` that `CREATE TABLE "ingested_messages"` with the FK constraints, the unique, and the index; `meta/_journal.json` gains `idx: 3`. No `ALTER`/`DROP` on other tables.

- [ ] **Step 5: Apply the migration**

Run: `pnpm db:migrate`
Expected: applies cleanly against the configured DB. (If the DB is unreachable, the schema/types are still validated by `pnpm check`; the DB-hitting test in Step 6 requires a reachable DB.)

- [ ] **Step 6: Run tests + check**

Run: `pnpm test` and `pnpm check`
Expected: PASS (new test green, all prior tests still green — this task is additive).

- [ ] **Step 7: Commit**

```bash
git add src/server/drizzle/schemas/ingested-messages.ts src/server/drizzle/schemas/index.ts src/server/drizzle/ingested-messages.test.ts drizzle/
git commit -m "feat(db): add ingested_messages per-user processing log"
```

---

## Task 2: Convert `jobs` to a shared global pool

Atomic data-model change. Dropping `jobs.user_id`/`gmail_msg_id`/`is_job`/`noise_reason` simultaneously breaks `ingestion.ts`, `matching.ts`, `seed-demo.ts`, and three test files — they are all updated in this one task so the build is green at the end. **Use a capable model.**

**Files:**
- Modify: `src/server/drizzle/schemas/jobs.ts`
- Modify: `src/server/services/ingestion.ts`
- Modify: `src/server/services/matching.ts` (`retrieveCandidates` only)
- Modify: `scripts/seed-demo.ts`
- Modify: `src/server/services/ingestion.test.ts`
- Modify: `src/server/services/matching.test.ts`
- Modify: `src/server/services/dedupe.test.ts`
- Modify: `src/server/drizzle/schema.test.ts`
- Generated + hand-edited: `drizzle/0004_*.sql`

- [ ] **Step 1: Edit the `jobs` schema**

In `src/server/drizzle/schemas/jobs.ts`: remove the `userId`, `gmailMsgId`, `isJob`, and `noiseReason` columns; remove the `user` import; remove the two old uniques and the `jobs_user_id_idx`; add a global unique on `dedupeHash`. Result:

```ts
import {
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

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
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
        dedupeHash: text("dedupe_hash").notNull(),
        embedding: vector("embedding", { dimensions: 768 }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("jobs_dedupe_unique").on(table.dedupeHash),
        index("jobs_embedding_idx").using(
            "hnsw",
            table.embedding.op("vector_cosine_ops"),
        ),
    ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
```

Note: the `boolean` import is still needed (`salarioExplicito`). Keep it. Drop `import { user }`.

- [ ] **Step 2: Rewrite `ingestion.ts`**

Replace the whole file `src/server/services/ingestion.ts` with:

```ts
import { getLogger } from "@logtape/logtape";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { classifyEmail } from "@/server/ai/classify-email";
import { embedText } from "@/server/ai/embed";
import { type ExtractedJob, extractJob } from "@/server/ai/extract-job";
import { db } from "@/server/drizzle/db";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import {
    type IngestionRun,
    ingestionRuns,
} from "@/server/drizzle/schemas/ingestion-runs";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { computeDedupeHash } from "./dedupe";
import {
    buildGmailQuery,
    getMessage,
    INGEST_MAX_MESSAGES,
    INGEST_NEWER_THAN_DAYS,
    listJobMessageIds,
    type ParsedGmailMessage,
    resolveSenders,
} from "./gmail";
import { normalizeSalary } from "./salary";

const logger = getLogger(["server", "ingest"]);

export const RAW_EMAIL_MAX_CHARS = 2000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export function coerceIsoDate(value: string | null): string | null {
    if (!value) {
        return null;
    }
    return ISO_DATE_RE.test(value) ? value : null;
}

export function toIsoDate(headerDate: string | null): string | null {
    if (!headerDate) {
        return null;
    }
    const d = new Date(headerDate);
    if (Number.isNaN(d.getTime())) {
        return null;
    }
    return d.toISOString().slice(0, 10);
}

export function buildJobEmbeddingText(input: {
    titulo: string;
    requisitos: string;
    skills: string[];
}): string {
    return [input.titulo, input.requisitos, input.skills.join(", ")]
        .filter((segment) => segment.trim().length > 0)
        .join(" ");
}

// Upsert a job into the global pool keyed by dedupe_hash. Returns the job id and
// whether it was newly inserted, so the caller embeds only brand-new
// convocatorias (the cost/speed win). Race-safe: a losing concurrent insert
// reads the winner's row back by dedupe_hash.
export async function upsertJob(
    row: Omit<typeof jobs.$inferInsert, "embedding">,
): Promise<{ jobId: string; isNew: boolean }> {
    const inserted = await db
        .insert(jobs)
        .values(row)
        .onConflictDoNothing({ target: jobs.dedupeHash })
        .returning({ id: jobs.id });
    const fresh = inserted[0];
    if (fresh) {
        return { jobId: fresh.id, isNew: true };
    }
    const [existing] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.dedupeHash, row.dedupeHash));
    if (!existing) {
        throw new Error("dedupe conflict but no existing job row found");
    }
    return { jobId: existing.id, isNew: false };
}

export async function setJobEmbedding(
    jobId: string,
    embedding: number[],
): Promise<void> {
    await db.update(jobs).set({ embedding }).where(eq(jobs.id, jobId));
}

// Record that a user's Gmail message was processed (idempotent per user+msg).
// jobId is null when the email was classified as noise.
export async function recordIngestedMessage(row: {
    userId: string;
    gmailMsgId: string;
    jobId: string | null;
    noiseReason: string | null;
}): Promise<void> {
    await db
        .insert(ingestedMessages)
        .values(row)
        .onConflictDoNothing({
            target: [ingestedMessages.userId, ingestedMessages.gmailMsgId],
        });
}

export async function getLastIngestionRun(
    userId: string,
): Promise<IngestionRun | null> {
    const rows = await db
        .select()
        .from(ingestionRuns)
        .where(eq(ingestionRuns.userId, userId))
        .orderBy(desc(ingestionRuns.startedAt))
        .limit(1);
    return rows[0] ?? null;
}

// Gmail message ids this user has already processed (job or noise).
async function existingMsgIds(
    userId: string,
    ids: string[],
): Promise<Set<string>> {
    if (ids.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ gmailMsgId: ingestedMessages.gmailMsgId })
        .from(ingestedMessages)
        .where(
            and(
                eq(ingestedMessages.userId, userId),
                inArray(ingestedMessages.gmailMsgId, ids),
            ),
        );
    return new Set(rows.map((r) => r.gmailMsgId));
}

// Upsert one extracted convocatoria into the global pool, embed it only if new,
// and link it to this user's inbox. Returns "new" | "existing".
async function ingestOneJob(params: {
    userId: string;
    msg: ParsedGmailMessage;
    extracted: ExtractedJob;
}): Promise<"new" | "existing"> {
    const { userId, msg, extracted } = params;
    const salary = normalizeSalary(extracted.salario, msg.text);
    const deadline = coerceIsoDate(extracted.deadline);
    const dedupeHash = computeDedupeHash({
        titulo: extracted.titulo,
        empresa: extracted.empresa,
        weekDate: deadline ?? toIsoDate(msg.date),
    });

    const { jobId, isNew } = await upsertJob({
        sourceSender: msg.sender,
        titulo: extracted.titulo,
        empresa: extracted.empresa,
        modalidad: extracted.modalidad,
        ubicacion: extracted.ubicacion,
        salarioMin: salary.salarioMin,
        salarioMax: salary.salarioMax,
        moneda: salary.moneda,
        salarioPeriodo: salary.salarioPeriodo,
        salarioExplicito: salary.salarioExplicito,
        requisitos: extracted.requisitos,
        skills: extracted.skills,
        deadline,
        applyLink: extracted.apply_link,
        rawEmail: msg.text.slice(0, RAW_EMAIL_MAX_CHARS),
        dedupeHash,
    });

    if (isNew) {
        const embedding = await embedText(
            buildJobEmbeddingText({
                titulo: extracted.titulo,
                requisitos: extracted.requisitos,
                skills: extracted.skills,
            }),
        );
        await setJobEmbedding(jobId, embedding);
    }

    await recordIngestedMessage({
        userId,
        gmailMsgId: msg.id,
        jobId,
        noiseReason: null,
    });
    return isNew ? "new" : "existing";
}

// --- Orchestrator (calls Gmail + Gemini; verified manually) ---
export async function runIngestion(params: {
    userId: string;
    accessToken: string;
}): Promise<IngestionRun> {
    const { userId, accessToken } = params;
    const [run] = await db.insert(ingestionRuns).values({ userId }).returning();
    if (!run) {
        throw new Error("Failed to create ingestion run row");
    }

    const metrics = {
        emailsScanned: 0,
        jobsFound: 0,
        noiseFiltered: 0,
        dupesRemoved: 0,
    };

    try {
        const senders = resolveSenders(ServerConfig.ingest.senders);
        const query = buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS);
        const ids = await listJobMessageIds(
            accessToken,
            query,
            INGEST_MAX_MESSAGES,
        );
        const already = await existingMsgIds(userId, ids);
        const fresh = ids.filter((id) => !already.has(id));

        for (const id of fresh) {
            try {
                const msg = await getMessage(accessToken, id);
                if (!msg.text) {
                    continue;
                }
                // Counts examined messages; a mid-message Gemini failure (caught
                // below) leaves this scanned but in none of the outcome buckets,
                // and unrecorded, so it is retried on the next run.
                metrics.emailsScanned++;
                const classified = await classifyEmail(msg.text);
                if (!classified.is_job) {
                    metrics.noiseFiltered++;
                    await recordIngestedMessage({
                        userId,
                        gmailMsgId: id,
                        jobId: null,
                        noiseReason: classified.noise_reason,
                    });
                    continue;
                }
                const extracted = await extractJob(msg.text);
                const outcome = await ingestOneJob({ userId, msg, extracted });
                if (outcome === "new") {
                    // Globally-new convocatoria this run contributed to the pool.
                    metrics.jobsFound++;
                } else {
                    // Convocatoria already in the pool (this or another user).
                    metrics.dupesRemoved++;
                }
            } catch (err) {
                // Tolerate per-message failures; never log raw body or token.
                logger.warn("ingest message {id} failed: {error}", {
                    id,
                    error: errMessage(err),
                });
            }
        }
    } catch (err) {
        logger.error("ingest run failed: {error}", { error: errMessage(err) });
    }

    const [finished] = await db
        .update(ingestionRuns)
        .set({ finishedAt: new Date(), ...metrics })
        .where(eq(ingestionRuns.id, run.id))
        .returning();
    if (!finished) {
        throw new Error("Failed to finalize ingestion run row");
    }
    return finished;
}
```

- [ ] **Step 3: Drop the user filter in `retrieveCandidates`**

In `src/server/services/matching.ts`, replace the `retrieveCandidates` function (the comment + signature + `conditions`) so it spans the whole pool. Remove `eq(jobs.userId, userId)` and `eq(jobs.isJob, true)`, and drop the now-unused `userId` parameter:

```ts
// Semantic retrieval over the shared global pool with hard filters. Jobs are no
// longer per-user — every user matches against the whole UNSA pool.
export async function retrieveCandidates(
    profileEmbedding: number[],
    profileUbicacion: string | null,
): Promise<Candidate[]> {
    const distance = sql<number>`${cosineDistance(jobs.embedding, profileEmbedding)}`;

    const conditions = [
        isNotNull(jobs.embedding),
        // Vigencia uses Postgres CURRENT_DATE (DB session tz, UTC-5 for Peru)
        // so a job expiring "today" local is not dropped in the evening.
        or(isNull(jobs.deadline), gte(jobs.deadline, sql`CURRENT_DATE`)),
    ];
    const city = profileUbicacion?.trim();
    if (city) {
        conditions.push(
            or(
                eq(jobs.modalidad, "remoto"),
                isNull(jobs.ubicacion),
                ilike(jobs.ubicacion, `%${city}%`),
            ),
        );
    }

    return db
        .select({
            id: jobs.id,
            titulo: jobs.titulo,
            empresa: jobs.empresa,
            modalidad: jobs.modalidad,
            ubicacion: jobs.ubicacion,
            salarioMin: jobs.salarioMin,
            salarioMax: jobs.salarioMax,
            moneda: jobs.moneda,
            salarioPeriodo: jobs.salarioPeriodo,
            salarioExplicito: jobs.salarioExplicito,
            requisitos: jobs.requisitos,
            skills: jobs.skills,
            applyLink: jobs.applyLink,
            distance,
        })
        .from(jobs)
        .where(and(...conditions))
        .orderBy(distance)
        .limit(RETRIEVAL_LIMIT);
}
```

Then update the single caller in `runMatching` (same file):

```ts
    const candidates = await retrieveCandidates(
        profile.embedding,
        profile.ubicacion,
    );
```

(`eq` is still used elsewhere in the file — leave the imports as they are.)

- [ ] **Step 4: Update `seed-demo.ts`**

In `scripts/seed-demo.ts`, the job insert (around lines 250-277) currently sets `userId`, `gmailMsgId`, and `isJob`. Jobs are global now — remove those three fields. The new insert values block:

```ts
        const result = await db
            .insert(jobs)
            .values({
                sourceSender: "demo@careerboost.local",
                titulo: j.titulo,
                empresa: j.empresa,
                modalidad: j.modalidad,
                ubicacion: j.ubicacion,
                salarioMin: j.salarioMin,
                salarioMax: j.salarioMax,
                moneda: j.moneda,
                salarioPeriodo: j.salarioPeriodo,
                salarioExplicito: j.salarioExplicito,
                requisitos: j.requisitos,
                skills: j.skills,
                applyLink: j.applyLink,
                dedupeHash: computeDedupeHash({
                    titulo: j.titulo,
                    empresa: j.empresa,
                    weekDate: SEED_WEEK_DATE,
                }),
                embedding,
            })
            .onConflictDoNothing()
            .returning({ id: jobs.id });
```

(Everything else in the file — profile seed, `runMatching({ userId })`, ingestion-run seed — is unchanged. The demo embeds each job inline; that is fine, the embed-once optimization only applies to the live ingest path.)

- [ ] **Step 5: Update `dedupe.test.ts` (add the global-collapse case)**

In `src/server/services/dedupe.test.ts`, inside the `describe("computeDedupeHash", ...)` block, add a test asserting the same convocatoria received in two inboxes on different days of the same ISO week collapses to one hash:

```ts
    it("collapses the same convocatoria across inboxes (same ISO week)", () => {
        // Two users receive the broadcast on different days of the same week;
        // with no deadline, the week-key fallback yields one identity.
        const inboxA = computeDedupeHash({
            titulo: "Analista de Datos",
            empresa: "UNSA",
            weekDate: "2026-06-08",
        });
        const inboxB = computeDedupeHash({
            titulo: "Analista de Datos",
            empresa: "UNSA",
            weekDate: "2026-06-13",
        });
        expect(inboxA).toBe(inboxB);
    });
```

- [ ] **Step 6: Rewrite the DB section of `ingestion.test.ts`**

In `src/server/services/ingestion.test.ts`: keep the pure-function describes (`buildJobEmbeddingText`, `coerceIsoDate`, `toIsoDate`) unchanged. Replace the imports and the `persistJob + getLastIngestionRun` describe block. New imports + new DB describe (the `jobRow` helper at the top of the file referenced `persistJob`'s shape — replace it too):

Replace the import block at the top:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import { jobs } from "@/server/drizzle/schemas/jobs";
import {
    buildJobEmbeddingText,
    coerceIsoDate,
    existingMsgIdsForTest,
    getLastIngestionRun,
    recordIngestedMessage,
    toIsoDate,
    upsertJob,
} from "@/server/services/ingestion";
```

`existingMsgIds` is currently module-private. Export it under a test-friendly alias by adding this line near it in `ingestion.ts` (Step 2 already defined the function; add the export alias at the end of the function definition area):

```ts
// Exposed for tests; production code uses it internally via runIngestion.
export const existingMsgIdsForTest = existingMsgIds;
```

Delete the old top-of-file `jobRow` helper (it set `userId`/`gmailMsgId` and is no longer valid). Replace the entire `describe("persistJob + getLastIngestionRun", ...)` block with:

```ts
const TEST_USER_ID = "spec08-ingestion-test-user";
const OTHER_USER_ID = "spec08-ingestion-other-user";

describe("upsertJob + recordIngestedMessage + getLastIngestionRun", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
        await db.delete(user).where(eq(user.id, OTHER_USER_ID));
        // Jobs are global (no user cascade) — delete the test rows explicitly.
        await db
            .delete(jobs)
            .where(inArray(jobs.dedupeHash, ["g-hash-a", "g-hash-b"]));
    });

    it("inserts a global job once and reuses it on the second inbox", async () => {
        await db.insert(user).values([
            {
                id: TEST_USER_ID,
                name: "Ingestion Test",
                email: "spec08-ingestion-test@example.com",
                emailVerified: false,
            },
            {
                id: OTHER_USER_ID,
                name: "Other Ingestion",
                email: "spec08-ingestion-other@example.com",
                emailVerified: false,
            },
        ]);

        const first = await upsertJob({
            titulo: "Backend Dev",
            empresa: "Acme",
            dedupeHash: "g-hash-a",
        });
        expect(first.isNew).toBe(true);

        // Same convocatoria (same dedupe_hash) from another inbox -> reuse.
        const second = await upsertJob({
            titulo: "Backend Dev",
            empresa: "Acme",
            dedupeHash: "g-hash-a",
        });
        expect(second.isNew).toBe(false);
        expect(second.jobId).toBe(first.jobId);

        const rows = await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(eq(jobs.dedupeHash, "g-hash-a"));
        expect(rows).toHaveLength(1);
    });

    it("records processed messages per user and skips already-seen ids", async () => {
        const { jobId } = await upsertJob({
            titulo: "Data Eng",
            empresa: "Beta",
            dedupeHash: "g-hash-b",
        });

        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m1",
            jobId,
            noiseReason: null,
        });
        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m2",
            jobId: null,
            noiseReason: "promo",
        });
        // Idempotent on (user, msg).
        await recordIngestedMessage({
            userId: TEST_USER_ID,
            gmailMsgId: "m1",
            jobId: null,
            noiseReason: null,
        });

        const seen = await existingMsgIdsForTest(TEST_USER_ID, [
            "m1",
            "m2",
            "m3",
        ]);
        expect(seen).toEqual(new Set(["m1", "m2"]));

        // Another user has not processed these.
        const other = await existingMsgIdsForTest(OTHER_USER_ID, ["m1", "m2"]);
        expect(other.size).toBe(0);
    });

    it("returns null when the user has no ingestion runs", async () => {
        const run = await getLastIngestionRun("spec08-no-such-user");
        expect(run).toBeNull();
    });
});
```

(The unused `and` import is referenced inside `existingMsgIdsForTest`'s usage only in the service file; in the test file remove `and` from the import if biome flags it as unused — keep only the symbols actually used: `eq`, `inArray`.)

- [ ] **Step 7: Rewrite the DB section of `matching.test.ts`**

In `src/server/services/matching.test.ts`: the pure-function describes (`computeScore`, `summarizeSalary`, `buildRerankCandidates`, `mergeRerank`) are unchanged. Update the DB section that starts at the mid-file imports (`import { and, eq } ...`). Replace the `jobRow` helper and the `retrieveCandidates + persistMatches` and `getFeed + setMatchStatus` describes so they (a) drop `userId`/`gmailMsgId`/`isJob` from job inserts, (b) assert global retrieval (another inbox's job IS now returned), (c) clean up jobs explicitly.

Replace the mid-file import block:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
import {
    getFeed,
    ProfileNotReadyError,
    persistMatches,
    retrieveCandidates,
    runMatching,
    type ScoredMatch,
    setMatchStatus,
} from "@/server/services/matching";
```

Replace the `jobRow` helper:

```ts
const T3_USER = "spec05-retrieval-test-user";

// Distinct deterministic 768-dim vectors. vec(0) is the query target.
function vec(seed: number): number[] {
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

function jobRow(overrides: Partial<typeof jobs.$inferInsert>) {
    return {
        dedupeHash: `h-${overrides.titulo ?? "x"}`,
        titulo: "Job",
        salarioExplicito: false,
        embedding: vec(0),
        ...overrides,
    };
}
```

Replace the `describe("retrieveCandidates + persistMatches", ...)` block:

```ts
describe("retrieveCandidates + persistMatches", () => {
    const HASHES = ["near", "far", "old", "otherpool"];

    afterAll(async () => {
        await db.delete(user).where(eq(user.id, T3_USER));
        // Global pool: delete the test jobs explicitly (no user cascade).
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("retrieves vigentes jobs from the whole pool ordered by cosine distance", async () => {
        await db.insert(user).values({
            id: T3_USER,
            name: "Retrieval Test",
            email: "spec05-retrieval-test@example.com",
            emailVerified: false,
        });

        await db.insert(jobs).values([
            jobRow({ dedupeHash: "near", titulo: "near", embedding: vec(0) }),
            jobRow({ dedupeHash: "far", titulo: "far", embedding: vec(5) }),
            // Expired deadline must be excluded.
            jobRow({
                dedupeHash: "old",
                titulo: "old",
                deadline: "2000-01-01",
                embedding: vec(0),
            }),
            // A job ingested via another user's inbox is now part of the shared
            // pool and MUST be retrievable (global pool, no per-user isolation).
            jobRow({
                dedupeHash: "otherpool",
                titulo: "otherpool",
                embedding: vec(0),
            }),
        ]);

        const candidates = await retrieveCandidates(vec(0), null);
        const titles = candidates.map((c) => c.titulo);
        expect(titles).toContain("near");
        expect(titles).toContain("far");
        expect(titles).toContain("otherpool");
        expect(titles).not.toContain("old");
        // Nearest first.
        expect(candidates.length).toBeGreaterThanOrEqual(2);
        const [first, second] = candidates;
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        if (first && second) {
            expect(first.distance).toBeLessThanOrEqual(second.distance);
        }
    });

    it("upserts matches and preserves a saved/dismissed status across recalculation", async () => {
        const [job] = await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(eq(jobs.dedupeHash, "near"));
        const jobId = job?.id ?? "";

        const first: ScoredMatch[] = [
            {
                jobId,
                score: 0.8,
                rerankScore: 70,
                explanation: "v1",
                flags: { skills_match: true, salario_transparente: false },
            },
        ];
        const inserted = await persistMatches(T3_USER, first);
        expect(inserted).toBe(1);

        await db
            .update(matches)
            .set({ status: "saved" })
            .where(and(eq(matches.userId, T3_USER), eq(matches.jobId, jobId)));

        const second: ScoredMatch[] = [
            {
                jobId,
                score: 0.9,
                rerankScore: 95,
                explanation: "v2",
                flags: { skills_match: true, salario_transparente: true },
            },
        ];
        await persistMatches(T3_USER, second);

        const rows = await db
            .select()
            .from(matches)
            .where(and(eq(matches.userId, T3_USER), eq(matches.jobId, jobId)));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.rerankScore).toBe(95);
        expect(rows[0]?.explanation).toBe("v2");
        expect(rows[0]?.status).toBe("saved");
    });
});
```

Replace the `describe("getFeed + setMatchStatus", ...)` block's job inserts (drop `userId`/`gmailMsgId`; keep `dedupeHash` unique) and its cleanup (delete user, then delete the three jobs by dedupe hash):

```ts
const T4_USER = "spec05-feed-test-user";

describe("getFeed + setMatchStatus", () => {
    const HASHES = ["f-high", "f-mid", "f-low"];

    afterAll(async () => {
        await db.delete(user).where(eq(user.id, T4_USER));
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("returns only above-threshold, non-dismissed matches ordered by rerank_score, and applies filters", async () => {
        await db.insert(user).values({
            id: T4_USER,
            name: "Feed Test",
            email: "spec05-feed-test@example.com",
            emailVerified: false,
        });

        const inserted = await db
            .insert(jobs)
            .values([
                {
                    dedupeHash: "f-high",
                    titulo: "High",
                    modalidad: "remoto",
                    ubicacion: "Arequipa",
                    salarioExplicito: true,
                    embedding: vec(0),
                },
                {
                    dedupeHash: "f-mid",
                    titulo: "Mid",
                    modalidad: "presencial",
                    ubicacion: "Lima",
                    salarioExplicito: false,
                    embedding: vec(1),
                },
                {
                    dedupeHash: "f-low",
                    titulo: "Low",
                    modalidad: "remoto",
                    ubicacion: "Arequipa",
                    salarioExplicito: true,
                    embedding: vec(2),
                },
            ])
            .returning({ id: jobs.id, titulo: jobs.titulo });

        const idOf = (t: string) =>
            inserted.find((j) => j.titulo === t)?.id ?? "";

        await persistMatches(T4_USER, [
            {
                jobId: idOf("High"),
                score: 0.9,
                rerankScore: 90,
                explanation: "alta",
                flags: { skills_match: true, salario_transparente: true },
            },
            {
                jobId: idOf("Mid"),
                score: 0.7,
                rerankScore: 70,
                explanation: "media",
                flags: { skills_match: true, salario_transparente: false },
            },
            {
                jobId: idOf("Low"),
                score: 0.2,
                rerankScore: 20,
                explanation: "baja",
                flags: { skills_match: false, salario_transparente: true },
            },
        ]);

        const all = await getFeed(T4_USER, {});
        expect(all.map((m) => m.job.titulo)).toEqual(["High", "Mid"]);
        expect(all[0]?.rerank_score).toBe(90);
        expect(all[0]?.job.salario_explicito).toBe(true);

        const salaried = await getFeed(T4_USER, { soloConSalario: true });
        expect(salaried.map((m) => m.job.titulo)).toEqual(["High"]);

        const remoto = await getFeed(T4_USER, { modalidad: "remoto" });
        expect(remoto.map((m) => m.job.titulo)).toEqual(["High"]);

        const lima = await getFeed(T4_USER, { ubicacion: "lima" });
        expect(lima.map((m) => m.job.titulo)).toEqual(["Mid"]);
    });

    it("sets a match status scoped to the user and hides dismissed from the feed", async () => {
        const [high] = await db
            .select({ id: matches.id })
            .from(matches)
            .innerJoin(jobs, eq(matches.jobId, jobs.id))
            .where(and(eq(matches.userId, T4_USER), eq(jobs.titulo, "High")));
        const matchId = high?.id ?? "";

        const updated = await setMatchStatus(T4_USER, matchId, "dismissed");
        expect(updated?.status).toBe("dismissed");

        const feed = await getFeed(T4_USER, {});
        expect(feed.map((m) => m.job.titulo)).toEqual(["Mid"]);
    });

    it("returns null when updating a match that does not belong to the user", async () => {
        const [mid] = await db
            .select({ id: matches.id })
            .from(matches)
            .innerJoin(jobs, eq(matches.jobId, jobs.id))
            .where(and(eq(matches.userId, T4_USER), eq(jobs.titulo, "Mid")));
        const result = await setMatchStatus(
            "spec05-someone-else",
            mid?.id ?? "",
            "saved",
        );
        expect(result).toBeNull();
    });
});

describe("runMatching guard", () => {
    it("throws ProfileNotReadyError when the user has no profile", async () => {
        await expect(
            runMatching({ userId: "spec05-no-profile-user" }),
        ).rejects.toBeInstanceOf(ProfileNotReadyError);
    });
});
```

(Remove the old `T3_OTHER_USER` constant and its cross-user-leak assertions — that behavior is intentionally reversed now.)

- [ ] **Step 8: Update `schema.test.ts`**

In `src/server/drizzle/schema.test.ts`, the two job inserts set `userId`/`gmailMsgId`. Jobs are global now. Replace the test body so it inserts by `dedupeHash` only and cleans up jobs explicitly:

```ts
import { cosineDistance, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";

function vec(seed: number): number[] {
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

describe("domain schema vectors", () => {
    const HASHES = ["schema-near", "schema-far"];

    afterAll(async () => {
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("stores vector(768) and orders jobs by cosine distance", async () => {
        await db.insert(jobs).values([
            { dedupeHash: "schema-near", titulo: "near", embedding: vec(0) },
            { dedupeHash: "schema-far", titulo: "far", embedding: vec(5) },
        ]);

        const query = vec(0);
        const rows = await db
            .select({ titulo: jobs.titulo })
            .from(jobs)
            .where(inArray(jobs.dedupeHash, HASHES))
            .orderBy(cosineDistance(jobs.embedding, query))
            .limit(1);

        expect(rows[0]?.titulo).toBe("near");
    });
});
```

(The `user` import and `TEST_USER_ID` are gone — this test no longer needs a user.)

- [ ] **Step 9: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0004_*.sql` containing, on `jobs`: `DROP CONSTRAINT`/`DROP INDEX` for the two old uniques + `jobs_user_id_idx`, `DROP COLUMN` for `user_id`/`gmail_msg_id`/`is_job`/`noise_reason`, and `ADD CONSTRAINT "jobs_dedupe_unique" UNIQUE("dedupe_hash")`. `meta/_journal.json` gains `idx: 4`.

- [ ] **Step 10: Prepend the data reset to the migration**

The new global unique on `dedupe_hash` will fail against existing per-user duplicate rows. Open the generated `drizzle/0004_*.sql` and add, as the very first statement (before any other), the reset (approved: data is regenerable):

```sql
TRUNCATE TABLE "matches", "jobs", "ingestion_runs" RESTART IDENTITY CASCADE;
--> statement-breakpoint
```

(`ingested_messages` is already empty. `CASCADE` clears the FK-dependent `matches`.)

- [ ] **Step 11: Apply the migration**

Run: `pnpm db:migrate`
Expected: applies cleanly (truncate first, then the column drops + unique add).

- [ ] **Step 12: Run tests + check**

Run: `pnpm test` then `pnpm check`
Expected: all green. If biome flags an unused import in a changed test file, remove just that symbol.

- [ ] **Step 13: Commit**

```bash
git add src/server/drizzle/schemas/jobs.ts src/server/services/ingestion.ts src/server/services/matching.ts scripts/seed-demo.ts src/server/services/ingestion.test.ts src/server/services/matching.test.ts src/server/services/dedupe.test.ts src/server/drizzle/schema.test.ts drizzle/
git commit -m "feat(jobs): shared global pool — dedupe global, embed once, match whole pool"
```

---

## Task 3: Surface `deadline` in the feed UI (additive)

Independent of Tasks 1-2 in behavior (the `deadline` column already exists). Wires the value through the feed + digest selects to a pure formatter and a badge.

**Files:**
- Modify: `src/server/services/matching.ts` (`getFeed` select + `FeedRow` + `FeedItem.job` + `mapFeedRow`)
- Modify: `src/server/services/digest.ts` (digest select)
- Modify: `src/frontend/lib/format.ts` (+ `format.test.ts`)
- Modify: `src/frontend/components/feed/match-card.tsx`
- Modify: `src/frontend/components/landing/product-showcase.tsx`
- Modify: `src/server/services/digest-email.test.ts`

- [ ] **Step 1: Write the failing formatter test**

In `src/frontend/lib/format.test.ts`, add:

```ts
import { formatDeadline } from "@/frontend/lib/format";

describe("formatDeadline", () => {
    it("returns null when there is no deadline", () => {
        expect(formatDeadline(null, "2026-06-14")).toBeNull();
    });
    it("flags a past deadline as urgent (cerrada)", () => {
        expect(formatDeadline("2026-06-10", "2026-06-14")).toEqual({
            label: "Convocatoria cerrada",
            urgent: true,
        });
    });
    it("flags today as urgent (cierra hoy)", () => {
        expect(formatDeadline("2026-06-14", "2026-06-14")).toEqual({
            label: "Cierra hoy",
            urgent: true,
        });
    });
    it("formats a future deadline as a day + month", () => {
        expect(formatDeadline("2026-06-25", "2026-06-14")).toEqual({
            label: "Cierra 25 jun",
            urgent: false,
        });
    });
});
```

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: FAIL ("formatDeadline is not a function").

- [ ] **Step 2: Implement `formatDeadline`**

In `src/frontend/lib/format.ts`, add (after the existing exports):

```ts
const MESES_ES = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
];

export interface DeadlineBadge {
    label: string;
    urgent: boolean;
}

// `deadline` and `today` are YYYY-MM-DD strings; lexicographic compare equals
// chronological for that format. Pure — the caller supplies `today`.
export function formatDeadline(
    deadline: string | null,
    today: string,
): DeadlineBadge | null {
    if (!deadline) {
        return null;
    }
    if (deadline < today) {
        return { label: "Convocatoria cerrada", urgent: true };
    }
    if (deadline === today) {
        return { label: "Cierra hoy", urgent: true };
    }
    const [, month, day] = deadline.split("-");
    const mes = MESES_ES[Number(month) - 1] ?? "";
    return { label: `Cierra ${Number(day)} ${mes}`.trim(), urgent: false };
}
```

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Thread `deadline` through the matching feed types + select**

In `src/server/services/matching.ts`:

1. `FeedItem.job` (interface): add `deadline: string | null;` (e.g. after `apply_link`).
2. `FeedRow` (interface): add `deadline: string | null;`.
3. `mapFeedRow`: add `deadline: r.deadline,` inside the `job: { ... }` object.
4. `getFeed` select: add `deadline: jobs.deadline,` to the `.select({ ... })` projection.

- [ ] **Step 4: Add `deadline` to the digest select**

In `src/server/services/digest.ts`, the select (around lines 76-85) projects the same job columns and feeds `mapFeedRow`. Add `deadline: jobs.deadline,` to that projection so the `FeedRow` it builds satisfies the new required field.

- [ ] **Step 5: Add `deadline` to the client card type + render the badge**

In `src/frontend/components/feed/match-card.tsx`:

1. Add to `MatchCardJob`: `deadline: string | null;`.
2. Import the icon and formatter:

```ts
import { CalendarClock } from "lucide-react";
import {
    type DeadlineBadge as DeadlineBadgeType,
    formatDeadline,
    formatMatchPct,
    formatSalaryBadge,
    modalidadLabel,
} from "@/frontend/lib/format";
```

3. At the top of the component body (after `const salary = ...`):

```ts
    const today = new Date().toISOString().slice(0, 10);
    const deadline: DeadlineBadgeType | null = formatDeadline(
        item.job.deadline,
        today,
    );
```

4. In the salary `<div className="mt-2">` block, render salary + optional deadline together:

```tsx
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={salary.variant}>{salary.label}</Badge>
                    {deadline ? (
                        <Badge
                            variant={deadline.urgent ? "destructive" : "outline"}
                        >
                            <CalendarClock className="size-3" />
                            {deadline.label}
                        </Badge>
                    ) : null}
                </div>
```

- [ ] **Step 6: Add `deadline` to the landing SAMPLE**

In `src/frontend/components/landing/product-showcase.tsx`, the static `SAMPLE: MatchCardItem` now needs the new required `job.deadline`. Add a value that shows the feature, e.g. `deadline: "2026-06-25",` inside `SAMPLE.job`.

- [ ] **Step 7: Fix the digest-email test fixture**

In `src/server/services/digest-email.test.ts`, `makeItem` builds a full `FeedItem`. Add `deadline: null,` to the default `job` object so it satisfies the new required field.

- [ ] **Step 8: Run tests + check**

Run: `pnpm test` then `pnpm check`
Expected: all green.

- [ ] **Step 9: Manual UI verify**

Run: `pnpm dev`, open `/feed` and `/digest`. Confirm a deadline badge shows on cards that have one (seed a future-deadline job if needed), urgent styling for today/past, and the landing `/` showcase card shows "Cierra 25 jun". No DOM test runner — visual check only (consistent with prior specs).

- [ ] **Step 10: Commit**

```bash
git add src/server/services/matching.ts src/server/services/digest.ts src/frontend/lib/format.ts src/frontend/lib/format.test.ts src/frontend/components/feed/match-card.tsx src/frontend/components/landing/product-showcase.tsx src/server/services/digest-email.test.ts
git commit -m "feat(feed): surface convocatoria deadline on match cards"
```

---

## Final review

After all three tasks, dispatch a final code review over the whole branch (`git diff main...feat/shared-jobs-pool`), then use superpowers:finishing-a-development-branch. Confirm: `pnpm check`, `pnpm test`, `pnpm build` all green; per-user isolation preserved for `profiles`/`matches`; `jobs` retrieval spans the pool; embeddings happen once per unique convocatoria; no secrets/tokens/raw-body logging introduced.

## Self-review notes (plan author)

- **Spec coverage:** schema (T1+T2), ingested_messages log (T1), embed-once (T2), global matching (T2), reset migration (T2), deadline UI (T3) — all covered.
- **Type consistency:** `upsertJob` returns `{jobId, isNew}` used identically in `ingestOneJob` and the test; `formatDeadline(deadline, today)` signature matches the test and the card call; `DeadlineBadge` exported and imported as `DeadlineBadgeType`. `existingMsgIds` exported as `existingMsgIdsForTest`.
- **Green-between-tasks:** T1 additive; T2 atomic (all column-droppers updated together); T3 additive. Each ends with `pnpm check` + `pnpm test`.
