import {
    and,
    cosineDistance,
    desc,
    eq,
    gte,
    ilike,
    isNotNull,
    ne,
    sql,
} from "drizzle-orm";
import type {
    RerankCandidateInput,
    RerankFlags,
    RerankItem,
} from "@/server/ai/rerank";
import { rerankJobs } from "@/server/ai/rerank";
import { db } from "@/server/drizzle/db";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { type Match, matches } from "@/server/drizzle/schemas/matches";
import { getProfile } from "@/server/services/profile";

export const RETRIEVAL_LIMIT = 200;
// Cosine ranks the whole pool; only the nearest few are worth an LLM rerank.
// The rest keep their cosine-derived score via the mergeRerank fallback.
export const RERANK_LIMIT = 20;
export const SALARY_BOOST = 0.05;
export const RERANK_THRESHOLD = 50;

const FALLBACK_EXPLANATION =
    "Relevante para tu perfil según similitud con tu experiencia e intereses.";

export class ProfileNotReadyError extends Error {
    constructor() {
        super("Profile not ready: missing profile or embedding");
        this.name = "ProfileNotReadyError";
    }
}

export interface Candidate {
    id: string;
    titulo: string | null;
    empresa: string | null;
    modalidad: string | null;
    ubicacion: string | null;
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
    requisitos: string | null;
    skills: string[] | null;
    applyLink: string | null;
    distance: number;
}

export interface ScoredMatch {
    jobId: string;
    score: number;
    rerankScore: number;
    explanation: string;
    flags: RerankFlags;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function computeScore(input: {
    distance: number;
    salarioExplicito: boolean;
}): number {
    return 1 - input.distance + (input.salarioExplicito ? SALARY_BOOST : 0);
}

export function summarizeSalary(input: {
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
}): string {
    if (!input.salarioExplicito || input.salarioMin == null) {
        return "No especificado";
    }
    const amount =
        input.salarioMax != null && input.salarioMax !== input.salarioMin
            ? `${input.salarioMin}-${input.salarioMax}`
            : `${input.salarioMin}`;
    return [input.moneda ?? "", amount, input.salarioPeriodo ?? ""]
        .filter((segment) => segment.length > 0)
        .join(" ");
}

export function buildRerankCandidates(
    candidates: Candidate[],
): RerankCandidateInput[] {
    return candidates.map((c) => ({
        job_id: c.id,
        titulo: c.titulo ?? "",
        empresa: c.empresa ?? "",
        modalidad: c.modalidad ?? "",
        ubicacion: c.ubicacion ?? "",
        requisitos: c.requisitos ?? "",
        skills: (c.skills ?? []).join(", "),
        salario: summarizeSalary(c),
    }));
}

export function mergeRerank(
    scored: Array<{ jobId: string; score: number; salarioExplicito: boolean }>,
    llmResults: RerankItem[],
): ScoredMatch[] {
    const byId = new Map(llmResults.map((r) => [r.job_id, r]));
    return scored.map((s) => {
        const llm = byId.get(s.jobId);
        if (llm) {
            return {
                jobId: s.jobId,
                score: s.score,
                rerankScore: clamp(Math.round(llm.match_score), 0, 100),
                explanation: llm.explanation,
                flags: llm.flags,
            };
        }
        return {
            jobId: s.jobId,
            score: s.score,
            rerankScore: clamp(Math.round(clamp(s.score, 0, 1) * 100), 0, 100),
            explanation: FALLBACK_EXPLANATION,
            flags: {
                skills_match: false,
                salario_transparente: s.salarioExplicito,
            },
        };
    });
}

// Semantic retrieval over the shared global pool. MVP: match against the WHOLE
// pool — no vigencia or location hard filters, so every embedded job is a
// candidate (location still shapes the rerank score as a soft signal, and
// expired postings still surface while the data is historical). Jobs are not
// per-user — every user matches against the whole UNSA pool. Nearest-by-cosine
// first, capped at RETRIEVAL_LIMIT.
export async function retrieveCandidates(
    profileEmbedding: number[],
): Promise<Candidate[]> {
    const distance = sql<number>`${cosineDistance(jobs.embedding, profileEmbedding)}`;

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
        .where(isNotNull(jobs.embedding))
        .orderBy(distance)
        .limit(RETRIEVAL_LIMIT);
}

export interface FeedFilters {
    soloConSalario?: boolean;
    modalidad?: string;
    ubicacion?: string;
}

export interface FeedItem {
    id: string;
    rerank_score: number | null;
    explanation: string | null;
    job: {
        titulo: string | null;
        empresa: string | null;
        modalidad: string | null;
        ubicacion: string | null;
        salario_min: number | null;
        salario_max: number | null;
        moneda: string | null;
        salario_periodo: string | null;
        salario_explicito: boolean;
        apply_link: string | null;
        deadline: string | null;
    };
    status: string;
}

export interface FeedRow {
    id: string;
    rerankScore: number | null;
    explanation: string | null;
    status: string;
    titulo: string | null;
    empresa: string | null;
    modalidad: string | null;
    ubicacion: string | null;
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
    applyLink: string | null;
    deadline: string | null;
}

export function mapFeedRow(r: FeedRow): FeedItem {
    return {
        id: r.id,
        rerank_score: r.rerankScore,
        explanation: r.explanation,
        job: {
            titulo: r.titulo,
            empresa: r.empresa,
            modalidad: r.modalidad,
            ubicacion: r.ubicacion,
            salario_min: r.salarioMin,
            salario_max: r.salarioMax,
            moneda: r.moneda,
            salario_periodo: r.salarioPeriodo,
            salario_explicito: r.salarioExplicito,
            apply_link: r.applyLink,
            deadline: r.deadline,
        },
        status: r.status,
    };
}

// Shared column projection for match list views (feed, saved). Shape matches
// FeedRow so the rows map straight through mapFeedRow.
const feedColumns = {
    id: matches.id,
    rerankScore: matches.rerankScore,
    explanation: matches.explanation,
    status: matches.status,
    titulo: jobs.titulo,
    empresa: jobs.empresa,
    modalidad: jobs.modalidad,
    ubicacion: jobs.ubicacion,
    salarioMin: jobs.salarioMin,
    salarioMax: jobs.salarioMax,
    moneda: jobs.moneda,
    salarioPeriodo: jobs.salarioPeriodo,
    salarioExplicito: jobs.salarioExplicito,
    applyLink: jobs.applyLink,
    deadline: jobs.deadline,
};

// Server-side feed: above-threshold, non-dismissed matches for the user,
// ordered by rerank_score desc, with optional salary/modalidad/ubicacion filters.
export async function getFeed(
    userId: string,
    filters: FeedFilters,
): Promise<FeedItem[]> {
    const conditions = [
        eq(matches.userId, userId),
        gte(matches.rerankScore, RERANK_THRESHOLD),
        ne(matches.status, "dismissed"),
    ];
    if (filters.soloConSalario) {
        conditions.push(eq(jobs.salarioExplicito, true));
    }
    if (filters.modalidad) {
        conditions.push(eq(jobs.modalidad, filters.modalidad));
    }
    if (filters.ubicacion) {
        conditions.push(ilike(jobs.ubicacion, `%${filters.ubicacion}%`));
    }

    const rows = await db
        .select(feedColumns)
        .from(matches)
        .innerJoin(jobs, eq(matches.jobId, jobs.id))
        .where(and(...conditions))
        .orderBy(desc(matches.rerankScore));

    return rows.map(mapFeedRow);
}

// The user's explicitly saved matches, ordered by rerank_score desc. No
// threshold filter: a saved match stays saved even if scoring later shifts.
export async function getSavedMatches(userId: string): Promise<FeedItem[]> {
    const rows = await db
        .select(feedColumns)
        .from(matches)
        .innerJoin(jobs, eq(matches.jobId, jobs.id))
        .where(and(eq(matches.userId, userId), eq(matches.status, "saved")))
        .orderBy(desc(matches.rerankScore));

    return rows.map(mapFeedRow);
}

export const ALL_JOBS_LIMIT = 200;

export interface JobListItem {
    // Job-centric: id is the job id. match_id is the user's match for this job
    // (null when never matched), used to deep-link to the detail page.
    job_id: string;
    match_id: string | null;
    rerank_score: number | null;
    status: string | null;
    job: {
        titulo: string | null;
        empresa: string | null;
        modalidad: string | null;
        ubicacion: string | null;
        salario_min: number | null;
        salario_max: number | null;
        moneda: string | null;
        salario_periodo: string | null;
        salario_explicito: boolean;
        skills: string[] | null;
        apply_link: string | null;
        deadline: string | null;
    };
}

// Browse the entire shared job pool — every job, not only the user's matched
// ones, and not only vigentes (the card flags an expired deadline as
// "Convocatoria cerrada"). Left-joins the user's match (unique per user+job) so
// a card can show the match badge and link to its detail when one exists.
// Vigentes first (expired sink to the bottom), then newest first.
const isExpired = sql`(${jobs.deadline} is not null and ${jobs.deadline} < CURRENT_DATE)`;

export async function getAllJobs(userId: string): Promise<JobListItem[]> {
    const rows = await db
        .select({
            jobId: jobs.id,
            titulo: jobs.titulo,
            empresa: jobs.empresa,
            modalidad: jobs.modalidad,
            ubicacion: jobs.ubicacion,
            salarioMin: jobs.salarioMin,
            salarioMax: jobs.salarioMax,
            moneda: jobs.moneda,
            salarioPeriodo: jobs.salarioPeriodo,
            salarioExplicito: jobs.salarioExplicito,
            skills: jobs.skills,
            applyLink: jobs.applyLink,
            deadline: jobs.deadline,
            matchId: matches.id,
            rerankScore: matches.rerankScore,
            status: matches.status,
        })
        .from(jobs)
        .leftJoin(
            matches,
            and(eq(matches.jobId, jobs.id), eq(matches.userId, userId)),
        )
        .orderBy(isExpired, desc(jobs.createdAt))
        .limit(ALL_JOBS_LIMIT);

    return rows.map((r) => ({
        job_id: r.jobId,
        match_id: r.matchId,
        rerank_score: r.rerankScore,
        status: r.status,
        job: {
            titulo: r.titulo,
            empresa: r.empresa,
            modalidad: r.modalidad,
            ubicacion: r.ubicacion,
            salario_min: r.salarioMin,
            salario_max: r.salarioMax,
            moneda: r.moneda,
            salario_periodo: r.salarioPeriodo,
            salario_explicito: r.salarioExplicito,
            skills: r.skills,
            apply_link: r.applyLink,
            deadline: r.deadline,
        },
    }));
}

export interface MatchDetailJob {
    titulo: string | null;
    empresa: string | null;
    modalidad: string | null;
    ubicacion: string | null;
    salario_min: number | null;
    salario_max: number | null;
    moneda: string | null;
    salario_periodo: string | null;
    salario_explicito: boolean;
    requisitos: string | null;
    skills: string[] | null;
    apply_link: string | null;
    deadline: string | null;
}

export interface MatchDetail {
    id: string;
    rerank_score: number | null;
    explanation: string | null;
    status: string;
    gmail_msg_id: string | null;
    email_sender: string | null;
    email_subject: string | null;
    job: MatchDetailJob;
}

// One match for the user with the full job plus the Gmail message id that
// produced it (for the "ver correo original" deep link). Scoped by user_id so a
// user cannot read another user's match. The Gmail id is left-joined from the
// user's own inbox log; when the same job arrived in several emails, the most
// recent one wins. Returns null when the match is missing or not owned.
export async function getMatchDetail(
    userId: string,
    matchId: string,
): Promise<MatchDetail | null> {
    const [row] = await db
        .select({
            id: matches.id,
            rerankScore: matches.rerankScore,
            explanation: matches.explanation,
            status: matches.status,
            gmailMsgId: ingestedMessages.gmailMsgId,
            emailSender: ingestedMessages.sender,
            emailSubject: ingestedMessages.subject,
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
            deadline: jobs.deadline,
        })
        .from(matches)
        .innerJoin(jobs, eq(matches.jobId, jobs.id))
        .leftJoin(
            ingestedMessages,
            and(
                eq(ingestedMessages.jobId, matches.jobId),
                eq(ingestedMessages.userId, userId),
            ),
        )
        .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
        .orderBy(desc(ingestedMessages.internalDate))
        .limit(1);

    if (!row) {
        return null;
    }
    return {
        id: row.id,
        rerank_score: row.rerankScore,
        explanation: row.explanation,
        status: row.status,
        gmail_msg_id: row.gmailMsgId,
        email_sender: row.emailSender,
        email_subject: row.emailSubject,
        job: {
            titulo: row.titulo,
            empresa: row.empresa,
            modalidad: row.modalidad,
            ubicacion: row.ubicacion,
            salario_min: row.salarioMin,
            salario_max: row.salarioMax,
            moneda: row.moneda,
            salario_periodo: row.salarioPeriodo,
            salario_explicito: row.salarioExplicito,
            requisitos: row.requisitos,
            skills: row.skills,
            apply_link: row.applyLink,
            deadline: row.deadline,
        },
    };
}

// Change a match's status. Scoped by user_id so a user cannot mutate another
// user's match. Returns the updated row, or null if not found / not owned.
export async function setMatchStatus(
    userId: string,
    matchId: string,
    status: "seen" | "saved" | "dismissed",
): Promise<Match | null> {
    const [row] = await db
        .update(matches)
        .set({ status })
        .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
        .returning();
    return row ?? null;
}

// --- Orchestrator (calls Gemini; verified manually) ---
export async function runMatching(params: {
    userId: string;
}): Promise<{ count: number }> {
    const { userId } = params;
    const profile = await getProfile(userId);
    if (!profile?.embedding) {
        throw new ProfileNotReadyError();
    }

    const candidates = await retrieveCandidates(profile.embedding);
    if (candidates.length === 0) {
        return { count: 0 };
    }

    // Cosine score for the whole pool — this is the base ranking.
    const scored = candidates.map((c) => ({
        jobId: c.id,
        score: computeScore({
            distance: c.distance,
            salarioExplicito: c.salarioExplicito,
        }),
        salarioExplicito: c.salarioExplicito,
    }));

    // candidates are sorted nearest-first, so the LLM only reranks/explains the
    // top RERANK_LIMIT. The long tail keeps its cosine score (mergeRerank
    // fallback) — keeps the call cheap and fast regardless of pool size.
    const llm = await rerankJobs(
        {
            escuelaProfesional: profile.escuelaProfesional,
            skills: profile.skills,
            experienciaResumen: profile.experienciaResumen,
            intereses: profile.intereses,
        },
        buildRerankCandidates(candidates.slice(0, RERANK_LIMIT)),
    );

    const merged = mergeRerank(scored, llm);
    const count = await persistMatches(userId, merged);
    return { count };
}

// Upsert matches on (user_id, job_id). On conflict, update scoring fields only
// so the user's status (seen/saved/dismissed) is preserved across recalcs.
export async function persistMatches(
    userId: string,
    items: ScoredMatch[],
): Promise<number> {
    for (const m of items) {
        await db
            .insert(matches)
            .values({
                userId,
                jobId: m.jobId,
                score: m.score,
                rerankScore: m.rerankScore,
                explanation: m.explanation,
                flags: m.flags,
            })
            .onConflictDoUpdate({
                target: [matches.userId, matches.jobId],
                set: {
                    score: m.score,
                    rerankScore: m.rerankScore,
                    explanation: m.explanation,
                    flags: m.flags,
                },
            });
    }
    return items.length;
}
