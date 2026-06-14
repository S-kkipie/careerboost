import {
    and,
    cosineDistance,
    desc,
    eq,
    gte,
    ilike,
    isNotNull,
    isNull,
    ne,
    or,
    sql,
} from "drizzle-orm";
import type {
    RerankCandidateInput,
    RerankFlags,
    RerankItem,
} from "@/server/ai/rerank";
import { rerankJobs } from "@/server/ai/rerank";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { type Match, matches } from "@/server/drizzle/schemas/matches";
import { getProfile } from "@/server/services/profile";

export const RETRIEVAL_LIMIT = 30;
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
        requisitos: c.requisitos ?? "",
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

// Semantic retrieval over the user's own jobs with hard filters. Per-user
// isolation is enforced by the user_id predicate.
export async function retrieveCandidates(
    userId: string,
    profileEmbedding: number[],
    profileUbicacion: string | null,
): Promise<Candidate[]> {
    const distance = sql<number>`${cosineDistance(jobs.embedding, profileEmbedding)}`;

    const conditions = [
        eq(jobs.userId, userId),
        eq(jobs.isJob, true),
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
    };
    status: string;
}

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
        .select({
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
        })
        .from(matches)
        .innerJoin(jobs, eq(matches.jobId, jobs.id))
        .where(and(...conditions))
        .orderBy(desc(matches.rerankScore));

    return rows.map((r) => ({
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
        },
        status: r.status,
    }));
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

    const candidates = await retrieveCandidates(
        userId,
        profile.embedding,
        profile.ubicacion,
    );
    if (candidates.length === 0) {
        return { count: 0 };
    }

    const scored = candidates.map((c) => ({
        jobId: c.id,
        score: computeScore({
            distance: c.distance,
            salarioExplicito: c.salarioExplicito,
        }),
        salarioExplicito: c.salarioExplicito,
    }));

    const llm = await rerankJobs(
        {
            escuelaProfesional: profile.escuelaProfesional,
            skills: profile.skills,
            experienciaResumen: profile.experienciaResumen,
            intereses: profile.intereses,
        },
        buildRerankCandidates(candidates),
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
