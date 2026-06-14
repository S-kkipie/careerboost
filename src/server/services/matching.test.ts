import { describe, expect, it } from "vitest";
import type { RerankItem } from "@/server/ai/rerank";
import {
    buildRerankCandidates,
    type Candidate,
    computeScore,
    mergeRerank,
    summarizeSalary,
} from "@/server/services/matching";

function candidate(overrides: Partial<Candidate>): Candidate {
    return {
        id: "job-1",
        titulo: "Backend Dev",
        empresa: "Acme",
        modalidad: "remoto",
        ubicacion: "Arequipa",
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Node, SQL",
        skills: ["Node", "SQL"],
        applyLink: null,
        distance: 0.2,
        ...overrides,
    };
}

describe("computeScore", () => {
    it("scores 1 - distance with no boost when salary is not explicit", () => {
        expect(
            computeScore({ distance: 0.2, salarioExplicito: false }),
        ).toBeCloseTo(0.8);
    });

    it("adds the salary boost when salary is explicit", () => {
        expect(
            computeScore({ distance: 0.2, salarioExplicito: true }),
        ).toBeCloseTo(0.85);
    });
});

describe("summarizeSalary", () => {
    it("returns 'No especificado' when salary is not explicit", () => {
        expect(
            summarizeSalary({
                salarioMin: null,
                salarioMax: null,
                moneda: null,
                salarioPeriodo: null,
                salarioExplicito: false,
            }),
        ).toBe("No especificado");
    });

    it("formats a range with currency and period", () => {
        expect(
            summarizeSalary({
                salarioMin: 2000,
                salarioMax: 3000,
                moneda: "PEN",
                salarioPeriodo: "mes",
                salarioExplicito: true,
            }),
        ).toBe("PEN 2000-3000 mes");
    });

    it("formats a single amount when max is null or equals min", () => {
        expect(
            summarizeSalary({
                salarioMin: 2500,
                salarioMax: null,
                moneda: "USD",
                salarioPeriodo: "mes",
                salarioExplicito: true,
            }),
        ).toBe("USD 2500 mes");
    });
});

describe("buildRerankCandidates", () => {
    it("maps candidates to rerank inputs with a salary summary", () => {
        const out = buildRerankCandidates([
            candidate({
                id: "job-9",
                titulo: "Data Eng",
                empresa: "Beta",
                requisitos: "SQL",
            }),
        ]);
        expect(out).toEqual([
            {
                job_id: "job-9",
                titulo: "Data Eng",
                empresa: "Beta",
                requisitos: "SQL",
                salario: "No especificado",
            },
        ]);
    });

    it("coalesces null text fields to empty strings", () => {
        const out = buildRerankCandidates([
            candidate({
                id: "job-3",
                titulo: null,
                empresa: null,
                requisitos: null,
            }),
        ]);
        expect(out[0]).toEqual({
            job_id: "job-3",
            titulo: "",
            empresa: "",
            requisitos: "",
            salario: "No especificado",
        });
    });
});

describe("mergeRerank", () => {
    const scored = [
        { jobId: "job-1", score: 0.85, salarioExplicito: true },
        { jobId: "job-2", score: 0.4, salarioExplicito: false },
    ];

    it("uses LLM values for scored candidates and clamps the score to 0-100", () => {
        const llm: RerankItem[] = [
            {
                job_id: "job-1",
                match_score: 150,
                explanation: "Encaja con tu experiencia.",
                flags: { skills_match: true, salario_transparente: true },
            },
        ];
        const merged = mergeRerank(scored, llm);
        const m1 = merged.find((m) => m.jobId === "job-1");
        expect(m1?.rerankScore).toBe(100);
        expect(m1?.explanation).toBe("Encaja con tu experiencia.");
        expect(m1?.flags.skills_match).toBe(true);
    });

    it("falls back deterministically for candidates the LLM omitted", () => {
        const merged = mergeRerank(scored, []);
        const m2 = merged.find((m) => m.jobId === "job-2");
        expect(m2?.rerankScore).toBe(40); // round(clamp(0.40,0,1)*100)
        expect(m2?.explanation.length).toBeGreaterThan(0);
        expect(m2?.flags).toEqual({
            skills_match: false,
            salario_transparente: false,
        });
    });

    it("drops LLM items whose job_id is not in the candidate set", () => {
        const llm: RerankItem[] = [
            {
                job_id: "hallucinated",
                match_score: 99,
                explanation: "no.",
                flags: { skills_match: true, salario_transparente: true },
            },
        ];
        const merged = mergeRerank(scored, llm);
        expect(merged.map((m) => m.jobId).sort()).toEqual(["job-1", "job-2"]);
    });
});
