# Spec 05 — Matching Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce, per egresado, a ranked list of jobs with a 0-100 match score and a Spanish explanation, persisted in `matches` and queryable for the feed.

**Architecture:** pgvector cosine retrieval over the user's own jobs (hard filters: `is_job`, vigencia, location) → small constant boost for explicit-salary jobs → Gemini rerank (0-100 + Spanish explanation + flags) → upsert into `matches` preserving the user's `saved`/`dismissed` status → server-side feed query with filters and a score threshold.

**Tech Stack:** Next.js 16 + Elysia (`/api/v1`), Drizzle ORM + Postgres + pgvector (`cosineDistance`), `@google/genai` (`gemini-2.5-flash`, `responseSchema`), Zod, Vitest, Biome.

---

## Decisions (locked before implementation)

These resolve every open choice in the spec. Implementers MUST follow them — do not re-litigate.

1. **Endpoints are versioned.** Router prefix `/match`, mounted under the app's `/api/v1` prefix → real paths `POST/GET /api/v1/match`, `PATCH /api/v1/match/:id`. (Spec writes `/api/match` shorthand; the app prefix makes it `/api/v1`.)
2. **No DB migration.** The `matches` table already exists from spec-02 with exactly the columns we need: `score` (real), `rerank_score` (integer), `explanation` (text), `flags` (jsonb), `status` (text default `'new'`), unique `(user_id, job_id)`. Do **not** generate or run a migration.
3. **Hard filters in retrieval:** `user_id = me`, `is_job = true`, `embedding IS NOT NULL`, vigencia (`deadline IS NULL OR deadline >= today`), and a **permissive** location filter applied only when the profile has a `ubicacion`: `modalidad = 'remoto' OR ubicacion IS NULL OR ubicacion ILIKE %ciudad%`. The carrera/área filter from the spec is intentionally **omitted** at the hard-filter layer (would vacuum results); relevance for carrera/área is handled by semantic retrieval + rerank. This is the spec's "empezar permisivo" guidance.
4. **Boost:** `score = (1 - distance) + (salario_explicito ? SALARY_BOOST : 0)`, `SALARY_BOOST = 0.05` (small constant; rewards transparency without dominating relevance).
5. **Retrieval limit:** `RETRIEVAL_LIMIT = 30`.
6. **Rerank output is wrapped in an object** `{ results: [...] }` (Gemini structured-output is most reliable with a top-level OBJECT). Each item: `{ job_id, match_score (0-100), explanation (Spanish), flags: { skills_match, salario_transparente } }`.
7. **Rerank robustness:** the LLM may omit or hallucinate `job_id`s. We merge by `job_id`: candidates the LLM scored use its values; candidates it omitted get a **deterministic fallback** (`rerankScore = round(clamp(score,0,1)*100)`, generic Spanish explanation, `flags = { skills_match: false, salario_transparente: salarioExplicito }`). Hallucinated ids (not in our candidate set) are dropped. Every retrieved candidate therefore gets a usable `rerank_score`.
8. **Persistence preserves user status.** Upsert on `(user_id, job_id)`: on conflict, update `score`/`rerank_score`/`explanation`/`flags` **only** — never touch `status`. New rows default to `'new'`. This preserves `seen`/`saved`/`dismissed` across recalculations.
9. **Feed threshold:** `RERANK_THRESHOLD = 50`. Feed returns matches with `rerank_score >= RERANK_THRESHOLD` and `status != 'dismissed'`, ordered by `rerank_score` desc.
10. **Feed filters (server-side):** `solo_con_salario` (→ `jobs.salario_explicito = true`), `modalidad` (exact), `ubicacion` (ILIKE substring).
11. **PATCH status** accepts only `seen | saved | dismissed` (validated by the router). `new` is the insert default and is not a settable target.
12. **Per-user isolation on every query** — every `select`/`update`/`upsert` filters by `userId` (no RLS; app-enforced). The `runMatching` orchestrator and `setMatchStatus` both scope by `userId`.
13. **No type suppression** (`any`/`as any`/`as unknown as`/`@ts-ignore`/`@ts-expect-error` all forbidden). **Never log** OAuth tokens, CV content, or raw email bodies; the rerank call sends extracted profile + extracted `requisitos` (not raw bodies) and nothing is logged.
14. **Orchestrators that call Gemini are verified manually** (same as spec-03/04). `runMatching` has no full automated test; we test its `ProfileNotReadyError` guard (reached before any Gemini call) only.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/server/ai/rerank.ts` (create) | Gemini rerank: Zod + Gemini `responseSchema`, `parseRerank`, `rerankJobs`. Pure parse + one network fn. | 1 |
| `src/server/ai/rerank.test.ts` (create) | Pure parse tests (no network). | 1 |
| `src/server/services/matching.ts` (create, then extend) | Retrieval, scoring, rerank-merge, persistence, feed, status, orchestrator. | 2,3,4,5 |
| `src/server/services/matching.test.ts` (create, then extend) | Pure unit tests + DB-backed tests. | 2,3,4,5 |
| `src/server/routers/match.ts` (create) | Elysia router: `POST /`, `GET /`, `PATCH /:id`, auth-gated. | 6 |
| `src/server/routers/match.test.ts` (create) | Auth-gating (401) tests. | 6 |
| `src/server/router.ts` (modify) | `.use(matchRouter)`. | 6 |

`matching.ts` is built across Tasks 2-5: Task 2 creates it with constants + types + pure helpers; Tasks 3,4,5 add functions and imports to the same file.

---

## Reference: existing patterns to mirror

- **AI module shape:** `src/server/ai/extract-job.ts` — Zod schema + `Type`-enum `RESPONSE_SCHEMA` + `parse*` + async fn using `genai.models.generateContent({ model: GEMINI_FLASH_MODEL, contents: [{text:PROMPT},{text:payload}], config: { responseMimeType: "application/json", responseSchema } })`, then `res.text` guarded for empty.
- **Vector query:** `src/server/drizzle/schema.test.ts` — `import { cosineDistance } from "drizzle-orm"`, `.orderBy(cosineDistance(jobs.embedding, query))`.
- **Service + DB-backed test:** `src/server/services/ingestion.ts` / `ingestion.test.ts` — `fakeEmbedding()` returning `Array.from({length:768},()=>0.02)`, test user id constant, `afterAll` cascade-deletes the user (`db.delete(user).where(eq(user.id, ID))`).
- **Router + auth gating:** `src/server/routers/ingest.ts` / `ingest.test.ts` — `auth.api.getSession({ headers: request.headers })`, `status(401,{code:"unauthenticated"})`, error mapping to `status(400,...)`.
- **Router with query/params/body schema:** `src/server/routers/profile.ts` — `Elysia` `t.Object` for `body`; same `t` for `query`/`params`.

Run a single test file with: `pnpm vitest run <path>`. Full gate: `pnpm check` (Biome + `tsc --noEmit`).

---

## Task 1: Gemini rerank module (`rerank.ts`)

**Files:**
- Create: `src/server/ai/rerank.ts`
- Test: `src/server/ai/rerank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/ai/rerank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRerank } from "@/server/ai/rerank";

const VALID = JSON.stringify({
    results: [
        {
            job_id: "job-1",
            match_score: 87,
            explanation: "Encaja con tu experiencia en backend y tu interés en datos.",
            flags: { skills_match: true, salario_transparente: true },
        },
        {
            job_id: "job-2",
            match_score: 40,
            explanation: "Relacionado pero pide más experiencia de la que tienes.",
            flags: { skills_match: false, salario_transparente: false },
        },
    ],
});

describe("parseRerank", () => {
    it("parses a valid rerank response into an array of items", () => {
        const items = parseRerank(VALID);
        expect(items).toHaveLength(2);
        expect(items[0]?.job_id).toBe("job-1");
        expect(items[0]?.match_score).toBe(87);
        expect(items[0]?.flags.skills_match).toBe(true);
    });

    it("throws when an item is missing a required field", () => {
        const bad = JSON.stringify({
            results: [{ job_id: "x", match_score: 50 }],
        });
        expect(() => parseRerank(bad)).toThrow();
    });

    it("throws when results is not an array", () => {
        const bad = JSON.stringify({ results: "nope" });
        expect(() => parseRerank(bad)).toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/ai/rerank.test.ts`
Expected: FAIL — cannot import `parseRerank` (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/server/ai/rerank.ts`:

```ts
import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const rerankFlagsSchema = z.object({
    skills_match: z.boolean(),
    salario_transparente: z.boolean(),
});

export const rerankItemSchema = z.object({
    job_id: z.string(),
    match_score: z.number(),
    explanation: z.string(),
    flags: rerankFlagsSchema,
});

export const rerankResultSchema = z.object({
    results: z.array(rerankItemSchema),
});

export type RerankFlags = z.infer<typeof rerankFlagsSchema>;
export type RerankItem = z.infer<typeof rerankItemSchema>;

export interface RerankProfileInput {
    escuelaProfesional: string | null;
    skills: string[] | null;
    experienciaResumen: string | null;
    intereses: string[] | null;
}

export interface RerankCandidateInput {
    job_id: string;
    titulo: string;
    empresa: string;
    requisitos: string;
    salario: string;
}

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        results: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    job_id: { type: Type.STRING },
                    match_score: { type: Type.NUMBER },
                    explanation: { type: Type.STRING },
                    flags: {
                        type: Type.OBJECT,
                        properties: {
                            skills_match: { type: Type.BOOLEAN },
                            salario_transparente: { type: Type.BOOLEAN },
                        },
                        propertyOrdering: [
                            "skills_match",
                            "salario_transparente",
                        ],
                        required: ["skills_match", "salario_transparente"],
                    },
                },
                propertyOrdering: [
                    "job_id",
                    "match_score",
                    "explanation",
                    "flags",
                ],
                required: ["job_id", "match_score", "explanation", "flags"],
            },
        },
    },
    propertyOrdering: ["results"],
    required: ["results"],
};

const PROMPT =
    "Eres un asistente de empleabilidad para egresados universitarios. Recibes " +
    "un perfil y una lista de vacantes (cada una con su 'job_id'). Para CADA " +
    "vacante devuelve un objeto con: 'job_id' EXACTAMENTE igual al recibido; " +
    "'match_score' entero de 0 a 100 que mida qué tan bien encaja la vacante con " +
    "el perfil (carrera, skills, experiencia e intereses); 'explanation' en " +
    "español, concreta y personal (p.ej. 'encaja con tu experiencia en X y tu " +
    "interés en Y'); y 'flags' con 'skills_match' (true si las skills requeridas " +
    "coinciden con las del perfil) y 'salario_transparente' (true si la vacante " +
    "indica un salario concreto, false si dice 'No especificado'). Responde SOLO " +
    "con JSON según el schema e incluye TODAS las vacantes recibidas.";

export function parseRerank(jsonText: string): RerankItem[] {
    return rerankResultSchema.parse(JSON.parse(jsonText)).results;
}

// Calls Gemini; verified manually.
export async function rerankJobs(
    profile: RerankProfileInput,
    candidates: RerankCandidateInput[],
): Promise<RerankItem[]> {
    const payload = JSON.stringify({ perfil: profile, vacantes: candidates });
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ text: PROMPT }, { text: payload }],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty rerank response");
    }
    return parseRerank(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/ai/rerank.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full gate**

Run: `pnpm check`
Expected: exit 0 (Biome clean, `tsc --noEmit` clean). Ignore any editor "Cannot find module @/..." LSP warnings — `pnpm check` is the source of truth.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/rerank.ts src/server/ai/rerank.test.ts
git commit -m "feat(match): add Gemini rerank module"
```

---

## Task 2: Matching pure helpers + types (`matching.ts`)

Create `matching.ts` with constants, types, the error class, and the pure functions: `computeScore`, `summarizeSalary`, `buildRerankCandidates`, `mergeRerank`.

**Files:**
- Create: `src/server/services/matching.ts`
- Test: `src/server/services/matching.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/services/matching.test.ts`:

```ts
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
        expect(computeScore({ distance: 0.2, salarioExplicito: false })).toBeCloseTo(0.8);
    });

    it("adds the salary boost when salary is explicit", () => {
        expect(computeScore({ distance: 0.2, salarioExplicito: true })).toBeCloseTo(0.85);
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
            candidate({ id: "job-9", titulo: "Data Eng", empresa: "Beta", requisitos: "SQL" }),
        ]);
        expect(out).toEqual([
            { job_id: "job-9", titulo: "Data Eng", empresa: "Beta", requisitos: "SQL", salario: "No especificado" },
        ]);
    });

    it("coalesces null text fields to empty strings", () => {
        const out = buildRerankCandidates([
            candidate({ id: "job-3", titulo: null, empresa: null, requisitos: null }),
        ]);
        expect(out[0]).toEqual({ job_id: "job-3", titulo: "", empresa: "", requisitos: "", salario: "No especificado" });
    });
});

describe("mergeRerank", () => {
    const scored = [
        { jobId: "job-1", score: 0.85, salarioExplicito: true },
        { jobId: "job-2", score: 0.40, salarioExplicito: false },
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
        expect(m2?.flags).toEqual({ skills_match: false, salario_transparente: false });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: FAIL — module `@/server/services/matching` not found.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/matching.ts`:

```ts
import type { RerankFlags, RerankCandidateInput, RerankItem } from "@/server/ai/rerank";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: PASS (12 tests — 2 computeScore, 4 summarizeSalary, 2 buildRerankCandidates, 4 mergeRerank).

- [ ] **Step 5: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/matching.ts src/server/services/matching.test.ts
git commit -m "feat(match): add matching pure helpers (score, salary summary, rerank merge)"
```

---

## Task 3: Retrieval + persistence (`matching.ts`)

Add `retrieveCandidates` (pgvector retrieval with hard filters) and `persistMatches` (status-preserving upsert) to `matching.ts`.

**Files:**
- Modify: `src/server/services/matching.ts`
- Test: `src/server/services/matching.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the test file)**

Append to `src/server/services/matching.test.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { afterAll } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
import {
    persistMatches,
    retrieveCandidates,
    type ScoredMatch,
} from "@/server/services/matching";

const T3_USER = "spec05-retrieval-test-user";

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
        await db.delete(user).where(eq(user.id, T3_USER));
    });

    it("retrieves only this user's vigentes job rows ordered by cosine distance", async () => {
        await db.insert(user).values({
            id: T3_USER,
            name: "Retrieval Test",
            email: "spec05-retrieval-test@example.com",
            emailVerified: false,
        });

        await db.insert(jobs).values([
            jobRow({ gmailMsgId: "m-near", dedupeHash: "near", titulo: "near", embedding: vec(0) }),
            jobRow({ gmailMsgId: "m-far", dedupeHash: "far", titulo: "far", embedding: vec(5) }),
            // Noise (is_job false) must be excluded.
            jobRow({ gmailMsgId: "m-noise", dedupeHash: "noise", titulo: "noise", isJob: false, embedding: vec(0) }),
            // Expired deadline must be excluded.
            jobRow({ gmailMsgId: "m-old", dedupeHash: "old", titulo: "old", deadline: "2000-01-01", embedding: vec(0) }),
        ]);

        const candidates = await retrieveCandidates(T3_USER, vec(0), null);
        const titles = candidates.map((c) => c.titulo);
        expect(titles).toContain("near");
        expect(titles).toContain("far");
        expect(titles).not.toContain("noise");
        expect(titles).not.toContain("old");
        // Nearest first.
        expect(candidates[0]?.titulo).toBe("near");
        expect(candidates[0]?.distance).toBeLessThan(candidates[1]?.distance ?? 1);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: FAIL — `retrieveCandidates` / `persistMatches` not exported.

- [ ] **Step 3: Add the implementation to `matching.ts`**

Add these imports to the top of `src/server/services/matching.ts` (merge with the existing import line):

```ts
import {
    and,
    cosineDistance,
    eq,
    gte,
    ilike,
    isNotNull,
    isNull,
    or,
} from "drizzle-orm";
import { db } from "@/server/drizzle/db";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
```

Append these functions to `src/server/services/matching.ts`:

```ts
// Semantic retrieval over the user's own jobs with hard filters. Per-user
// isolation is enforced by the user_id predicate.
export async function retrieveCandidates(
    userId: string,
    profileEmbedding: number[],
    profileUbicacion: string | null,
): Promise<Candidate[]> {
    const today = new Date().toISOString().slice(0, 10);
    const distance = cosineDistance(jobs.embedding, profileEmbedding);

    const conditions = [
        eq(jobs.userId, userId),
        eq(jobs.isJob, true),
        isNotNull(jobs.embedding),
        or(isNull(jobs.deadline), gte(jobs.deadline, today)),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: PASS (11 pure + 2 DB-backed = 13 tests).

- [ ] **Step 5: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/matching.ts src/server/services/matching.test.ts
git commit -m "feat(match): add pgvector retrieval and status-preserving match upsert"
```

---

## Task 4: Feed query + status update (`matching.ts`)

Add `getFeed` (server-side filtered, threshold-gated feed) and `setMatchStatus` (per-user status change).

**Files:**
- Modify: `src/server/services/matching.ts`
- Test: `src/server/services/matching.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the test file)**

Append to `src/server/services/matching.test.ts`:

```ts
import {
    getFeed,
    setMatchStatus,
} from "@/server/services/matching";

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
            { jobId: idOf("High"), score: 0.9, rerankScore: 90, explanation: "alta", flags: { skills_match: true, salario_transparente: true } },
            { jobId: idOf("Mid"), score: 0.7, rerankScore: 70, explanation: "media", flags: { skills_match: true, salario_transparente: false } },
            { jobId: idOf("Low"), score: 0.2, rerankScore: 20, explanation: "baja", flags: { skills_match: false, salario_transparente: true } },
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
        const result = await setMatchStatus("spec05-someone-else", mid?.id ?? "", "saved");
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: FAIL — `getFeed` / `setMatchStatus` not exported.

- [ ] **Step 3: Add the implementation to `matching.ts`**

Add `desc` and `ne` to the existing `drizzle-orm` import in `src/server/services/matching.ts` (final import becomes `and, cosineDistance, desc, eq, gte, ilike, isNotNull, isNull, ne, or`). Add a `Match` type import:

```ts
import { type Match, matches } from "@/server/drizzle/schemas/matches";
```

(Replace the existing `import { matches } from ...` line from Task 3 with the line above.)

Append these types + functions to `src/server/services/matching.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: PASS (11 pure + 2 + 3 DB-backed = 16 tests).

- [ ] **Step 5: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/matching.ts src/server/services/matching.test.ts
git commit -m "feat(match): add server-side feed query and per-user status update"
```

---

## Task 5: Orchestrator `runMatching` (`matching.ts`)

Wire profile → retrieve → score → rerank → merge → persist. Calls Gemini, so it is verified manually; the one automated test covers the `ProfileNotReadyError` guard (reached before any Gemini call).

**Files:**
- Modify: `src/server/services/matching.ts`
- Test: `src/server/services/matching.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the test file)**

Append to `src/server/services/matching.test.ts`:

```ts
import { ProfileNotReadyError, runMatching } from "@/server/services/matching";

describe("runMatching guard", () => {
    it("throws ProfileNotReadyError when the user has no profile", async () => {
        await expect(
            runMatching({ userId: "spec05-no-profile-user" }),
        ).rejects.toBeInstanceOf(ProfileNotReadyError);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: FAIL — `runMatching` not exported.

- [ ] **Step 3: Add the implementation to `matching.ts`**

Add these imports to `src/server/services/matching.ts`:

```ts
import { rerankJobs } from "@/server/ai/rerank";
import { getProfile } from "@/server/services/profile";
```

Append the orchestrator to `src/server/services/matching.ts`:

```ts
// --- Orchestrator (calls Gemini; verified manually) ---
export async function runMatching(params: {
    userId: string;
}): Promise<{ count: number }> {
    const { userId } = params;
    const profile = await getProfile(userId);
    if (!profile || !profile.embedding) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/services/matching.test.ts`
Expected: PASS (17 tests total).

- [ ] **Step 5: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/matching.ts src/server/services/matching.test.ts
git commit -m "feat(match): add runMatching orchestrator (retrieve -> score -> rerank -> persist)"
```

---

## Task 6: Match router + wiring (`match.ts`, `router.ts`)

Expose `POST /api/v1/match`, `GET /api/v1/match`, `PATCH /api/v1/match/:id`, auth-gated.

**Files:**
- Create: `src/server/routers/match.ts`
- Create: `src/server/routers/match.test.ts`
- Modify: `src/server/router.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/match (auth gating)", () => {
    it("POST /match returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match", { method: "POST" }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /match returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("PATCH /match/:id returns 401 when unauthenticated (valid body)", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/match/some-id", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "seen" }),
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/routers/match.test.ts`
Expected: FAIL — `matchRouter` not wired (route 404s, so status is not 401).

- [ ] **Step 3: Create the router**

Create `src/server/routers/match.ts`:

```ts
import { Elysia, t } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    getFeed,
    ProfileNotReadyError,
    runMatching,
    setMatchStatus,
} from "@/server/services/matching";

export const matchRouter = new Elysia({ prefix: "/match" })
    .post("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            return await runMatching({ userId: session.user.id });
        } catch (e) {
            if (e instanceof ProfileNotReadyError) {
                return status(400, { code: "profile_not_ready" });
            }
            throw e;
        }
    })
    .get(
        "/",
        async ({ request, status, query }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const feed = await getFeed(session.user.id, {
                soloConSalario: query.solo_con_salario === "true",
                modalidad: query.modalidad,
                ubicacion: query.ubicacion,
            });
            return { matches: feed };
        },
        {
            query: t.Object({
                solo_con_salario: t.Optional(t.String()),
                modalidad: t.Optional(t.String()),
                ubicacion: t.Optional(t.String()),
            }),
        },
    )
    .patch(
        "/:id",
        async ({ request, status, params, body }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const updated = await setMatchStatus(
                session.user.id,
                params.id,
                body.status,
            );
            if (!updated) {
                return status(404, { code: "match_not_found" });
            }
            return { match: updated };
        },
        {
            params: t.Object({ id: t.String() }),
            body: t.Object({
                status: t.Union([
                    t.Literal("seen"),
                    t.Literal("saved"),
                    t.Literal("dismissed"),
                ]),
            }),
        },
    );
```

- [ ] **Step 4: Wire it into the app router**

In `src/server/router.ts`, add the import after the `ingestRouter` import (line 7):

```ts
import { matchRouter } from "@/server/routers/match";
```

And add `.use(matchRouter)` after `.use(ingestRouter)` (the last `.use` in the chain):

```ts
    .use(profileRouter)
    .use(ingestRouter)
    .use(matchRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/server/routers/match.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite + gate**

Run: `pnpm test`
Expected: all tests pass (prior 69 + new: rerank 3, matching 17, match router 3 = 92).

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/match.ts src/server/routers/match.test.ts src/server/router.ts
git commit -m "feat(match): expose POST/GET/PATCH /api/v1/match endpoints"
```

---

## Manual verification (after all tasks)

The Gemini rerank path is not exercised by the automated suite. Verify once against real data (requires a logged-in session with a profile + ingested jobs):

1. Ensure dev DB is up (port 5433 per `.env.local`) and `GEMINI_API_KEY` is set.
2. Run spec-03 (upload CV → profile) and spec-04 (`POST /api/v1/ingest`) so the user has a profile with an embedding and jobs.
3. `POST /api/v1/ingest` already done → then `POST /api/v1/match` → expect `{ count: N }` with N plausible (> 0 if any vigente jobs).
4. `GET /api/v1/match` → expect `{ matches: [...] }` ordered by `rerank_score` desc, each with a Spanish `explanation` and a nested `job`. Confirm explicit-salary jobs rank well at equal relevance.
5. `GET /api/v1/match?solo_con_salario=true` → only explicit-salary jobs. Try `?modalidad=remoto` and `?ubicacion=Arequipa`.
6. `PATCH /api/v1/match/<id>` with `{ "status": "saved" }` → `{ match }`. Re-run `POST /api/v1/match` → confirm the saved status persists (Decision 8).
7. `PATCH` with `{ "status": "dismissed" }` → confirm it disappears from `GET /api/v1/match`.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Retrieval (pgvector, cosine, hard filters) → Task 3 `retrieveCandidates`. ✓
- Carrera/área filter "permisivo" → Decision 3 (omitted at hard layer, handled by retrieval + rerank). ✓
- Boost por salario explícito → Task 2 `computeScore` + `SALARY_BOOST`. ✓
- Rerank Gemini (0-100 + explanation ES + flags) → Task 1 `rerank.ts`. ✓
- Persistencia upsert preservando saved/dismissed → Task 3 `persistMatches` (Decision 8), verified by test. ✓
- `POST /match` recalcula → { count } → Tasks 5 + 6. ✓ (returns `{ count }`)
- `GET /match?filter` ordenado por rerank_score → Task 4 `getFeed` + Task 6. ✓
- `PATCH /match/:id` cambia status → Task 4 `setMatchStatus` + Task 6. ✓
- Filtros server-side (solo_con_salario, modalidad, ubicacion) → Task 4 + Decision 10. ✓
- Umbral configurable → `RERANK_THRESHOLD` constant (Decision 9). ✓
- Contract `GET /api/match` shape → `FeedItem` matches contract fields exactly (id, rerank_score, explanation, job{...snake_case...}, status). ✓
- Acceptance: scores plausibles, salary favored, ES explanation, PATCH persists, filters server-side → covered by tests + manual verification. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code. ✓

**3. Type consistency:**
- `Candidate` fields (Task 2) match the `retrieveCandidates` select (Task 3) exactly. ✓
- `ScoredMatch` (Task 2) is produced by `mergeRerank` (Task 2) and consumed by `persistMatches` (Task 3) — fields align (jobId, score, rerankScore, explanation, flags). ✓
- `RerankItem` / `RerankFlags` / `RerankCandidateInput` (Task 1) imported and used in Task 2 (`mergeRerank`, `buildRerankCandidates`) and Task 5 (`rerankJobs`). ✓
- `RerankProfileInput` (Task 1) fields match what `runMatching` passes from `Profile` (Task 5): escuelaProfesional, skills, experienciaResumen, intereses — all exist on `Profile`. ✓
- `FeedItem` (Task 4) returned by `getFeed`, consumed by router (Task 6) as `{ matches: feed }`. ✓
- `setMatchStatus` status param type `"seen"|"saved"|"dismissed"` matches the router's `t.Union` of literals (Task 6). ✓
- Drizzle imports accumulate correctly: Task 3 introduces `and, cosineDistance, eq, gte, ilike, isNotNull, isNull, or`; Task 4 adds `desc, ne`. Final set is consistent. ✓
- `matches` table import: Task 3 imports `{ matches }`; Task 4 replaces it with `{ type Match, matches }`. Explicit instruction given. ✓
