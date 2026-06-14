import { afterAll, describe, expect, it } from "vitest";
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

    it("formats a single amount when max is null", () => {
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

    it("formats a single amount when max equals min", () => {
        expect(
            summarizeSalary({
                salarioMin: 2500,
                salarioMax: 2500,
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

    it("rounds a float match_score from the LLM", () => {
        const llm: RerankItem[] = [
            {
                job_id: "job-1",
                match_score: 87.6,
                explanation: "Encaja con tu experiencia.",
                flags: { skills_match: true, salario_transparente: true },
            },
        ];
        const merged = mergeRerank(scored, llm);
        const m1 = merged.find((m) => m.jobId === "job-1");
        expect(m1?.rerankScore).toBe(88);
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

import { and, eq } from "drizzle-orm";
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

const T3_USER = "spec05-retrieval-test-user";
const T3_OTHER_USER = "spec05-other-user";

// Distinct deterministic 768-dim vectors. vec(0) is the query target.
function vec(seed: number): number[] {
    return Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0));
}

function jobRow(overrides: Partial<typeof jobs.$inferInsert>) {
    return {
        userId: T3_USER,
        gmailMsgId: `m-${overrides.dedupeHash ?? "x"}`,
        dedupeHash: `h-${overrides.titulo ?? "x"}`,
        titulo: "Job",
        isJob: true,
        salarioExplicito: false,
        embedding: vec(0),
        ...overrides,
    };
}

describe("retrieveCandidates + persistMatches", () => {
    afterAll(async () => {
        // Cascade deletes each user's jobs and matches too.
        await db.delete(user).where(eq(user.id, T3_USER));
        await db.delete(user).where(eq(user.id, T3_OTHER_USER));
    });

    it("retrieves only this user's vigentes job rows ordered by cosine distance", async () => {
        await db.insert(user).values({
            id: T3_USER,
            name: "Retrieval Test",
            email: "spec05-retrieval-test@example.com",
            emailVerified: false,
        });

        await db.insert(jobs).values([
            jobRow({
                gmailMsgId: "m-near",
                dedupeHash: "near",
                titulo: "near",
                embedding: vec(0),
            }),
            jobRow({
                gmailMsgId: "m-far",
                dedupeHash: "far",
                titulo: "far",
                embedding: vec(5),
            }),
            // Noise (is_job false) must be excluded.
            jobRow({
                gmailMsgId: "m-noise",
                dedupeHash: "noise",
                titulo: "noise",
                isJob: false,
                embedding: vec(0),
            }),
            // Expired deadline must be excluded.
            jobRow({
                gmailMsgId: "m-old",
                dedupeHash: "old",
                titulo: "old",
                deadline: "2000-01-01",
                embedding: vec(0),
            }),
        ]);

        // Another user's job (same vector) must never leak into this user's
        // retrieval — per-user isolation.
        await db.insert(user).values({
            id: T3_OTHER_USER,
            name: "Other User",
            email: "spec05-other-user@example.com",
            emailVerified: false,
        });
        await db.insert(jobs).values({
            userId: T3_OTHER_USER,
            gmailMsgId: "m-other",
            dedupeHash: "h-other",
            titulo: "otheruser",
            isJob: true,
            salarioExplicito: false,
            embedding: vec(0),
        });

        const candidates = await retrieveCandidates(T3_USER, vec(0), null);
        const titles = candidates.map((c) => c.titulo);
        expect(titles).toContain("near");
        expect(titles).toContain("far");
        expect(titles).not.toContain("noise");
        expect(titles).not.toContain("old");
        // Cross-user leakage guard.
        expect(titles).not.toContain("otheruser");
        // Nearest first.
        expect(candidates.length).toBeGreaterThanOrEqual(2);
        const [first, second] = candidates;
        expect(first?.titulo).toBe("near");
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        if (first && second) {
            expect(first.distance).toBeLessThan(second.distance);
        }
    });

    it("upserts matches and preserves a saved/dismissed status across recalculation", async () => {
        const [job] = await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(eq(jobs.userId, T3_USER), eq(jobs.titulo, "near")));
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

        // User saves it.
        await db
            .update(matches)
            .set({ status: "saved" })
            .where(and(eq(matches.userId, T3_USER), eq(matches.jobId, jobId)));

        // Recalculate with new scores.
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
        // Status preserved.
        expect(rows[0]?.status).toBe("saved");
    });
});

const T4_USER = "spec05-feed-test-user";

describe("getFeed + setMatchStatus", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, T4_USER));
    });

    it("returns only above-threshold, non-dismissed matches ordered by rerank_score, and applies filters", async () => {
        await db.insert(user).values({
            id: T4_USER,
            name: "Feed Test",
            email: "spec05-feed-test@example.com",
            emailVerified: false,
        });

        // Three jobs: high (with salary), mid (no salary), low (below threshold).
        const inserted = await db
            .insert(jobs)
            .values([
                {
                    userId: T4_USER,
                    gmailMsgId: "f-high",
                    dedupeHash: "f-high",
                    titulo: "High",
                    modalidad: "remoto",
                    ubicacion: "Arequipa",
                    salarioExplicito: true,
                    embedding: vec(0),
                },
                {
                    userId: T4_USER,
                    gmailMsgId: "f-mid",
                    dedupeHash: "f-mid",
                    titulo: "Mid",
                    modalidad: "presencial",
                    ubicacion: "Lima",
                    salarioExplicito: false,
                    embedding: vec(1),
                },
                {
                    userId: T4_USER,
                    gmailMsgId: "f-low",
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

        // No filters: High (90) and Mid (70) pass threshold (>=50); Low (20) hidden.
        const all = await getFeed(T4_USER, {});
        expect(all.map((m) => m.job.titulo)).toEqual(["High", "Mid"]);
        expect(all[0]?.rerank_score).toBe(90);
        expect(all[0]?.job.salario_explicito).toBe(true);

        // solo_con_salario: only jobs with explicit salary above threshold -> High.
        const salaried = await getFeed(T4_USER, { soloConSalario: true });
        expect(salaried.map((m) => m.job.titulo)).toEqual(["High"]);

        // modalidad filter.
        const remoto = await getFeed(T4_USER, { modalidad: "remoto" });
        expect(remoto.map((m) => m.job.titulo)).toEqual(["High"]);

        // ubicacion filter (substring, case-insensitive).
        const lima = await getFeed(T4_USER, { ubicacion: "lima" });
        expect(lima.map((m) => m.job.titulo)).toEqual(["Mid"]);
    });

    it("sets a match status scoped to the user and hides dismissed from the feed", async () => {
        const [high] = await db
            .select({ id: matches.id, jobTitulo: jobs.titulo })
            .from(matches)
            .innerJoin(jobs, eq(matches.jobId, jobs.id))
            .where(and(eq(matches.userId, T4_USER), eq(jobs.titulo, "High")));
        const matchId = high?.id ?? "";

        const updated = await setMatchStatus(T4_USER, matchId, "dismissed");
        expect(updated?.status).toBe("dismissed");

        // Dismissed disappears from the feed; Mid remains.
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
