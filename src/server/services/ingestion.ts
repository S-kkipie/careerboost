import { getLogger } from "@logtape/logtape";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

export function toDate(headerDate: string | null): Date | null {
    if (!headerDate) {
        return null;
    }
    const d = new Date(headerDate);
    return Number.isNaN(d.getTime()) ? null : d;
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

// Upsert a job into the global pool keyed by dedupe_hash. Returns the job id,
// whether it was newly inserted (for metrics), and whether the resolved row
// still needs an embedding. The caller embeds whenever needsEmbedding is true,
// so a row whose embedding failed on a previous run self-heals on the next.
// Race-safe: a losing concurrent insert reads the winner's row back by
// dedupe_hash.
export async function upsertJob(
    row: Omit<typeof jobs.$inferInsert, "embedding">,
): Promise<{ jobId: string; isNew: boolean; needsEmbedding: boolean }> {
    const inserted = await db
        .insert(jobs)
        .values(row)
        .onConflictDoNothing({ target: jobs.dedupeHash })
        .returning({ id: jobs.id });
    const fresh = inserted[0];
    if (fresh) {
        return { jobId: fresh.id, isNew: true, needsEmbedding: true };
    }
    const [existing] = await db
        .select({
            id: jobs.id,
            hasEmbedding: sql<boolean>`${jobs.embedding} is not null`,
        })
        .from(jobs)
        .where(eq(jobs.dedupeHash, row.dedupeHash));
    if (!existing) {
        throw new Error("dedupe conflict but no existing job row found");
    }
    return {
        jobId: existing.id,
        isNew: false,
        needsEmbedding: !existing.hasEmbedding,
    };
}

export async function setJobEmbedding(
    jobId: string,
    embedding: number[],
): Promise<void> {
    await db.update(jobs).set({ embedding }).where(eq(jobs.id, jobId));
}

// Record that a user's Gmail message was processed (idempotent per user+msg).
// jobId is null when the email was classified as noise. Display metadata
// (subject/sender/internalDate) is captured here for the bandeja inbox.
export async function recordIngestedMessage(row: {
    userId: string;
    gmailMsgId: string;
    jobId: string | null;
    noiseReason: string | null;
    subject?: string | null;
    sender?: string | null;
    internalDate?: Date | null;
}): Promise<void> {
    await db
        .insert(ingestedMessages)
        .values({
            userId: row.userId,
            gmailMsgId: row.gmailMsgId,
            jobId: row.jobId,
            noiseReason: row.noiseReason,
            subject: row.subject ?? null,
            sender: row.sender ?? null,
            internalDate: row.internalDate ?? null,
        })
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

// Exposed for tests; production code uses it internally via runIngestion.
export const existingMsgIdsForTest = existingMsgIds;

// Upsert one extracted convocatoria into the global pool, embed it whenever it
// is missing an embedding (new row, or a prior run that failed to embed), and
// link it to this user's inbox. Returns "new" | "existing".
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

    const { jobId, isNew, needsEmbedding } = await upsertJob({
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

    if (needsEmbedding) {
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
        subject: msg.subject,
        sender: msg.sender,
        internalDate: toDate(msg.date),
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
                        subject: msg.subject,
                        sender: msg.sender,
                        internalDate: toDate(msg.date),
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
