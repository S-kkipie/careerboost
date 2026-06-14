import {
    and,
    cosineDistance,
    eq,
    gte,
    ilike,
    isNotNull,
    isNull,
    or,
    sql,
} from "drizzle-orm";
import type {
    RerankCandidateInput,
    RerankFlags,
    RerankItem,
} from "@/server/ai/rerank";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";

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
