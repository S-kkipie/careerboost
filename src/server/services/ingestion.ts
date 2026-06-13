import { getLogger } from "@logtape/logtape";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { classifyEmail } from "@/server/ai/classify-email";
import { embedText } from "@/server/ai/embed";
import { type ExtractedJob, extractJob } from "@/server/ai/extract-job";
import { db } from "@/server/drizzle/db";
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

// Insert a job; returns true if a new row landed, false on a unique conflict
// (either gmail_msg_id or dedupe_hash already present for this user).
export async function persistJob(
    row: typeof jobs.$inferInsert,
): Promise<boolean> {
    const inserted = await db
        .insert(jobs)
        .values(row)
        .onConflictDoNothing()
        .returning({ id: jobs.id });
    return inserted.length > 0;
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

async function existingMsgIds(
    userId: string,
    ids: string[],
): Promise<Set<string>> {
    if (ids.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ gmailMsgId: jobs.gmailMsgId })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), inArray(jobs.gmailMsgId, ids)));
    return new Set(rows.map((r) => r.gmailMsgId));
}

// Build the job row for one extracted message and persist it.
// Returns true if inserted, false if it deduped away.
async function ingestOneJob(params: {
    userId: string;
    msg: ParsedGmailMessage;
    extracted: ExtractedJob;
}): Promise<boolean> {
    const { userId, msg, extracted } = params;
    const salary = normalizeSalary(extracted.salario, msg.text);
    const deadline = coerceIsoDate(extracted.deadline);
    const dedupeHash = computeDedupeHash({
        titulo: extracted.titulo,
        empresa: extracted.empresa,
        weekDate: deadline ?? toIsoDate(msg.date),
    });
    const embedding = await embedText(
        buildJobEmbeddingText({
            titulo: extracted.titulo,
            requisitos: extracted.requisitos,
            skills: extracted.skills,
        }),
    );
    return persistJob({
        userId,
        gmailMsgId: msg.id,
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
        isJob: true,
        noiseReason: null,
        dedupeHash,
        embedding,
    });
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
                // below) leaves this scanned but in none of the 3 outcome buckets.
                metrics.emailsScanned++;
                const classified = await classifyEmail(msg.text);
                if (!classified.is_job) {
                    metrics.noiseFiltered++;
                    continue;
                }
                const extracted = await extractJob(msg.text);
                const inserted = await ingestOneJob({ userId, msg, extracted });
                if (inserted) {
                    metrics.jobsFound++;
                } else {
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
