import type {
    RerankCandidateInput,
    RerankFlags,
    RerankItem,
} from "@/server/ai/rerank";

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
