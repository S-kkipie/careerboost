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
                modalidad: "remoto",
                ubicacion: "Arequipa",
                requisitos: "SQL",
                skills: "Node, SQL",
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
            modalidad: "remoto",
            ubicacion: "Arequipa",
            requisitos: "",
            skills: "Node, SQL",
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

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
import {
    getAllJobs,
    getFeed,
    getMatchDetail,
    getSavedMatches,
    ProfileNotReadyError,
    persistMatches,
    retrieveCandidates,
    runMatching,
    type ScoredMatch,
    setMatchStatus,
} from "@/server/services/matching";

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

const T5_USER = "spec06-detail-test-user";

describe("getMatchDetail", () => {
    const HASH = "detail-job";

    afterAll(async () => {
        // Cascade removes the user's match + ingested rows; job deleted by hash.
        await db.delete(user).where(eq(user.id, T5_USER));
        await db.delete(jobs).where(eq(jobs.dedupeHash, HASH));
    });

    it("returns the full job with the user's Gmail message id, scoped by user", async () => {
        await db.insert(user).values({
            id: T5_USER,
            name: "Detail Test",
            email: "spec06-detail-test@example.com",
            emailVerified: false,
        });
        const [job] = await db
            .insert(jobs)
            .values(
                jobRow({
                    dedupeHash: HASH,
                    titulo: "Detail Job",
                    empresa: "Acme",
                    skills: ["node", "sql"],
                }),
            )
            .returning({ id: jobs.id });
        const jobId = job?.id ?? "";

        await db.insert(ingestedMessages).values({
            userId: T5_USER,
            gmailMsgId: "gmail-xyz",
            jobId,
            sender: "Bolsa UNSA <bolsa@unsa.edu.pe>",
            subject: "Convocatoria practicante",
        });
        await persistMatches(T5_USER, [
            {
                jobId,
                score: 0.9,
                rerankScore: 88,
                explanation: "encaja",
                flags: { skills_match: true, salario_transparente: false },
            },
        ]);
        const [m] = await db
            .select({ id: matches.id })
            .from(matches)
            .where(and(eq(matches.userId, T5_USER), eq(matches.jobId, jobId)));
        const matchId = m?.id ?? "";

        const detail = await getMatchDetail(T5_USER, matchId);
        expect(detail?.id).toBe(matchId);
        expect(detail?.gmail_msg_id).toBe("gmail-xyz");
        expect(detail?.email_sender).toBe("Bolsa UNSA <bolsa@unsa.edu.pe>");
        expect(detail?.email_subject).toBe("Convocatoria practicante");
        expect(detail?.job.titulo).toBe("Detail Job");
        expect(detail?.job.empresa).toBe("Acme");
        expect(detail?.job.skills).toEqual(["node", "sql"]);
        expect(detail?.rerank_score).toBe(88);

        // A different user must not be able to read this match.
        const none = await getMatchDetail("spec06-someone-else", matchId);
        expect(none).toBeNull();
    });
});

const T6_USER = "spec06-saved-test-user";

describe("getSavedMatches", () => {
    const HASHES = ["sv-a", "sv-b"];

    afterAll(async () => {
        await db.delete(user).where(eq(user.id, T6_USER));
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("returns only the user's saved matches, newest score first", async () => {
        await db.insert(user).values({
            id: T6_USER,
            name: "Saved Test",
            email: "spec06-saved-test@example.com",
            emailVerified: false,
        });
        const inserted = await db
            .insert(jobs)
            .values([
                jobRow({ dedupeHash: "sv-a", titulo: "Saved A" }),
                jobRow({ dedupeHash: "sv-b", titulo: "Other B" }),
            ])
            .returning({ id: jobs.id, titulo: jobs.titulo });
        const idOf = (t: string) =>
            inserted.find((j) => j.titulo === t)?.id ?? "";

        await persistMatches(T6_USER, [
            {
                jobId: idOf("Saved A"),
                score: 0.8,
                rerankScore: 80,
                explanation: "a",
                flags: { skills_match: true, salario_transparente: false },
            },
            {
                jobId: idOf("Other B"),
                score: 0.7,
                rerankScore: 70,
                explanation: "b",
                flags: { skills_match: false, salario_transparente: false },
            },
        ]);
        // Save A; B stays "new" and must be excluded.
        await db
            .update(matches)
            .set({ status: "saved" })
            .where(
                and(
                    eq(matches.userId, T6_USER),
                    eq(matches.jobId, idOf("Saved A")),
                ),
            );

        const result = await getSavedMatches(T6_USER);
        expect(result.map((m) => m.job.titulo)).toEqual(["Saved A"]);
        expect(result[0]?.status).toBe("saved");
    });
});

const T7_USER = "spec06-alljobs-test-user";

describe("getAllJobs", () => {
    const HASHES = ["aj-matched", "aj-unmatched", "aj-expired"];

    afterAll(async () => {
        await db.delete(user).where(eq(user.id, T7_USER));
        await db.delete(jobs).where(inArray(jobs.dedupeHash, HASHES));
    });

    it("lists the whole pool (incl. expired), with match fields only on the user's matched job", async () => {
        await db.insert(user).values({
            id: T7_USER,
            name: "AllJobs Test",
            email: "spec06-alljobs-test@example.com",
            emailVerified: false,
        });
        const inserted = await db
            .insert(jobs)
            .values([
                jobRow({ dedupeHash: "aj-matched", titulo: "Matched Job" }),
                jobRow({ dedupeHash: "aj-unmatched", titulo: "Unmatched Job" }),
                jobRow({
                    dedupeHash: "aj-expired",
                    titulo: "Expired Job",
                    deadline: "2000-01-01",
                }),
            ])
            .returning({ id: jobs.id, titulo: jobs.titulo });
        const idOf = (t: string) =>
            inserted.find((j) => j.titulo === t)?.id ?? "";

        await persistMatches(T7_USER, [
            {
                jobId: idOf("Matched Job"),
                score: 0.9,
                rerankScore: 91,
                explanation: "match",
                flags: { skills_match: true, salario_transparente: false },
            },
        ]);

        const all = await getAllJobs(T7_USER);
        const titles = all.map((j) => j.job.titulo);
        // Unmatched job appears even with no match for the user.
        expect(titles).toContain("Matched Job");
        expect(titles).toContain("Unmatched Job");
        // Expired job is still listed (the card flags it as closed).
        expect(titles).toContain("Expired Job");

        const matched = all.find((j) => j.job.titulo === "Matched Job");
        expect(matched?.rerank_score).toBe(91);
        expect(matched?.match_id).not.toBeNull();
        expect(matched?.job_id).toBe(idOf("Matched Job"));

        const unmatched = all.find((j) => j.job.titulo === "Unmatched Job");
        expect(unmatched?.match_id).toBeNull();
        expect(unmatched?.rerank_score).toBeNull();
        expect(unmatched?.status).toBeNull();
    });

    it("does not leak another user's match onto the same job", async () => {
        const all = await getAllJobs("spec06-alljobs-stranger");
        const matched = all.find((j) => j.job.titulo === "Matched Job");
        // Same global job is visible, but with no match for this stranger.
        expect(matched?.match_id).toBeNull();
        expect(matched?.rerank_score).toBeNull();
    });
});
