# Spec 04 — Email Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read bolsa-de-trabajo emails from the user's Gmail (read-only), classify job vs noise, extract each vacancy into the standardized `jobs` shape with salary clarity, dedupe, embed, and record per-run impact metrics in `ingestion_runs`.

**Architecture:** A thin orchestrator (`runIngestion`) drives the pipeline: Gmail list/get → per-message classify (Gemini) → extract (Gemini) → deterministic salary normalize → deterministic dedupe hash → embed → upsert. All deterministic units (Gmail MIME parsing, salary regex, dedupe hashing, query building, embedding-text builder) live in their own pure modules with full unit tests. The Gemini/Gmail-calling functions are manually verified (no network in CI), matching the spec-03 convention where `parseExtractedProfile` is unit-tested but `extractProfileFromPdf` is not. Two HTTP endpoints expose the pipeline: `POST /api/v1/ingest` (run) and `GET /api/v1/ingest/last` (impact panel).

**Tech Stack:** Next.js 16 + Elysia (mounted at `/api/v1`), Better Auth (Google access token for Gmail), Drizzle + Postgres + pgvector, `@google/genai` (`gemini-2.5-flash` classify/extract, `gemini-embedding-2` @768), Vitest, Biome (4-space, double quotes).

---

## Decisions (locked before implementation)

1. **Endpoints are versioned.** Spec writes `POST /api/ingest`; our app mounts everything under `prefix: "/api/v1"`, so the real paths are `POST /api/v1/ingest` and `GET /api/v1/ingest/last` — consistent with `/api/v1/profile` from spec-03.
2. **No DB migration.** The `jobs` and `ingestion_runs` tables (spec-02, migrations 0000–0002) already contain every column this pipeline writes. Do **not** add a migration.
3. **Noise = count only.** When the classifier returns `is_job=false`, we increment `noise_filtered` and skip. We do **not** persist noise rows (the `jobs` table requires `dedupe_hash NOT NULL`; storing noise rows adds no MVP value — YAGNI). The spec explicitly allows "guardar registro mínimo (o solo contar)".
4. **Two-layer idempotency.** (a) Before processing, fetch the set of `gmail_msg_id`s already in `jobs` for this user and skip them entirely (saves Gemini calls; a re-run with nothing new does zero work). (b) On insert, `onConflictDoNothing` against `jobs_user_dedupe_unique`; a conflict means a genuine duplicate vacancy from a different email → `dupes_removed++`.
5. **`emails_scanned` counts messages actually examined this run** (fresh messages with non-empty body), not the raw inbox total. A re-run with nothing new reports all-zero metrics — honest for the impact panel's noise%.
6. **Salary normalization is deterministic.** Trust the LLM when it says `explicito=true` with a numeric `min`; otherwise run a regex fallback over the raw email text. Regex hit → fill amounts + `explicito=true`; no hit → `explicito=false`. Fully unit-tested, no network.
7. **Dedupe key** = `sha256(normalizeTitle(titulo) | normalizeTitle(empresa) | weekKey(deadline ?? emailDate))`. `weekKey` is ISO year-week. Accents/case are normalized away.
8. **Senders are configurable.** `BOLSA_SENDERS` env (optional, comma-separated) overrides a `DEFAULT_BOLSA_SENDERS` const. Window/size are consts (`INGEST_NEWER_THAN_DAYS = 90`, `INGEST_MAX_MESSAGES = 50`) — demo-sized.
9. **Privacy.** Store only `rawEmail.slice(0, RAW_EMAIL_MAX_CHARS)` (2000 chars). Never log raw bodies or tokens. Per-message failures are caught, counted-around, and logged with message id + error string only.

---

## File Structure

| File | Responsibility | New? |
|------|----------------|------|
| `src/config/env.ts` | add optional `BOLSA_SENDERS` | modify |
| `src/config/server-config.ts` | expose `ServerConfig.ingest.senders` | modify |
| `.env.example` | document `BOLSA_SENDERS` | modify |
| `src/server/services/gmail-parse.ts` | pure Gmail MIME decode/header/HTML→text | create |
| `src/server/services/gmail-parse.test.ts` | unit tests for the above | create |
| `src/server/services/gmail.ts` | add query builder + `listJobMessageIds` + `getMessage` | modify |
| `src/server/services/gmail.test.ts` | unit tests for query builder + sender resolution | create |
| `src/server/ai/classify-email.ts` | Gemini job-vs-noise classifier + zod parse | create |
| `src/server/ai/classify-email.test.ts` | unit tests for parse fn | create |
| `src/server/ai/extract-job.ts` | Gemini vacancy extractor + zod parse | create |
| `src/server/ai/extract-job.test.ts` | unit tests for parse fn | create |
| `src/server/services/salary.ts` | deterministic salary normalize + regex | create |
| `src/server/services/salary.test.ts` | unit tests | create |
| `src/server/services/dedupe.ts` | title normalize + ISO week + dedupe hash | create |
| `src/server/services/dedupe.test.ts` | unit tests | create |
| `src/server/services/ingestion.ts` | orchestrator + persistence + pure helpers | create |
| `src/server/services/ingestion.test.ts` | pure-helper unit tests + DB persistence tests | create |
| `src/server/routers/ingest.ts` | `POST /ingest`, `GET /ingest/last` | create |
| `src/server/routers/ingest.test.ts` | auth-gating tests | create |
| `src/server/router.ts` | mount `ingestRouter` | modify |

---

## Task 1: Senders config

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/server-config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `BOLSA_SENDERS` to env schema**

In `src/config/env.ts`, add one line to the `server` block (after `CRON_SECRET`):

```ts
        CRON_SECRET: z.string().min(16),
        // Spec 04 — comma-separated bolsa sender addresses; empty falls back to a const.
        BOLSA_SENDERS: z.string().optional(),
```

And add the matching line to `runtimeEnv` (after the `CRON_SECRET` entry):

```ts
        CRON_SECRET: process.env.CRON_SECRET,
        BOLSA_SENDERS: process.env.BOLSA_SENDERS,
```

- [ ] **Step 2: Expose it via ServerConfig**

In `src/config/server-config.ts`, add an `ingest` block after `gemini`:

```ts
export const ServerConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    gemini: {
        apiKey: env.GEMINI_API_KEY,
    },
    ingest: {
        // Comma-separated bolsa sender addresses; empty -> DEFAULT_BOLSA_SENDERS in gmail.ts.
        senders: env.BOLSA_SENDERS,
    },
} as const;
```

- [ ] **Step 3: Document the env var**

Append to `.env.example`:

```
# Spec 04 — comma-separated bolsa-de-trabajo sender addresses
# e.g. bolsadetrabajo@unsa.edu.pe,empleos@unsa.edu.pe  (empty uses a built-in default)
BOLSA_SENDERS=
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `pnpm check`
Expected: exit 0 (no test for config — `ServerConfig.gemini` from spec-03 likewise had none).

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/server-config.ts .env.example
git commit -m "feat: BOLSA_SENDERS config for email ingestion"
```

---

## Task 2: Gmail MIME parsing (pure)

**Files:**
- Create: `src/server/services/gmail-parse.ts`
- Test: `src/server/services/gmail-parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/gmail-parse.test.ts`:

```ts
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
    decodeBase64Url,
    extractMessageText,
    getHeader,
    stripHtml,
} from "@/server/services/gmail-parse";

function b64url(s: string): string {
    return Buffer.from(s, "utf8").toString("base64url");
}

describe("decodeBase64Url", () => {
    it("decodes base64url back to utf8", () => {
        expect(decodeBase64Url(b64url("hola mundo"))).toBe("hola mundo");
    });
});

describe("getHeader", () => {
    it("finds a header case-insensitively", () => {
        const headers = [
            { name: "From", value: "a@b.com" },
            { name: "Subject", value: "Vacante" },
        ];
        expect(getHeader(headers, "from")).toBe("a@b.com");
        expect(getHeader(headers, "SUBJECT")).toBe("Vacante");
    });

    it("returns null when absent or undefined", () => {
        expect(getHeader([], "From")).toBeNull();
        expect(getHeader(undefined, "From")).toBeNull();
    });
});

describe("stripHtml", () => {
    it("removes tags, scripts, styles and decodes basic entities", () => {
        const html =
            "<style>x{}</style><p>Hola&nbsp;&amp; <b>mundo</b></p><script>1</script>";
        expect(stripHtml(html)).toBe("Hola & mundo");
    });
});

describe("extractMessageText", () => {
    it("prefers text/plain over text/html", () => {
        const payload = {
            mimeType: "multipart/alternative",
            parts: [
                { mimeType: "text/plain", body: { data: b64url("plano  texto") } },
                { mimeType: "text/html", body: { data: b64url("<p>html</p>") } },
            ],
        };
        expect(extractMessageText(payload)).toBe("plano texto");
    });

    it("falls back to stripped text/html when no plain part exists", () => {
        const payload = {
            mimeType: "multipart/alternative",
            parts: [
                { mimeType: "text/html", body: { data: b64url("<p>solo html</p>") } },
            ],
        };
        expect(extractMessageText(payload)).toBe("solo html");
    });

    it("reads a single-part body when there are no sub-parts", () => {
        const payload = { mimeType: "text/plain", body: { data: b64url("cuerpo") } };
        expect(extractMessageText(payload)).toBe("cuerpo");
    });

    it("returns empty string for an empty payload", () => {
        expect(extractMessageText(undefined)).toBe("");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/services/gmail-parse.test.ts`
Expected: FAIL — `Cannot find module '@/server/services/gmail-parse'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/gmail-parse.ts`:

```ts
import { Buffer } from "node:buffer";

export interface GmailHeader {
    name: string;
    value: string;
}

export interface GmailPayloadPart {
    mimeType?: string;
    filename?: string;
    headers?: GmailHeader[];
    body?: { data?: string; size?: number };
    parts?: GmailPayloadPart[];
}

export interface GmailMessageResponse {
    id: string;
    payload?: GmailPayloadPart;
    snippet?: string;
}

export function decodeBase64Url(data: string): string {
    return Buffer.from(data, "base64url").toString("utf8");
}

export function getHeader(
    headers: GmailHeader[] | undefined,
    name: string,
): string | null {
    const target = name.toLowerCase();
    const found = headers?.find((h) => h.name.toLowerCase() === target);
    return found?.value ?? null;
}

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function findPart(
    part: GmailPayloadPart,
    mimeType: string,
): GmailPayloadPart | null {
    if (part.mimeType === mimeType && part.body?.data) {
        return part;
    }
    for (const child of part.parts ?? []) {
        const found = findPart(child, mimeType);
        if (found) {
            return found;
        }
    }
    return null;
}

// Walk the MIME tree; prefer text/plain, fall back to stripped text/html,
// then to a single-part body. Returns "" when nothing decodable is present.
export function extractMessageText(
    payload: GmailPayloadPart | undefined,
): string {
    if (!payload) {
        return "";
    }
    const plain = findPart(payload, "text/plain");
    if (plain?.body?.data) {
        return decodeBase64Url(plain.body.data).replace(/\s+/g, " ").trim();
    }
    const html = findPart(payload, "text/html");
    if (html?.body?.data) {
        return stripHtml(decodeBase64Url(html.body.data));
    }
    if (payload.body?.data) {
        return decodeBase64Url(payload.body.data).replace(/\s+/g, " ").trim();
    }
    return "";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/services/gmail-parse.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/gmail-parse.ts src/server/services/gmail-parse.test.ts
git commit -m "feat: pure Gmail MIME parsing helpers"
```

---

## Task 3: Gmail message retrieval

**Files:**
- Modify: `src/server/services/gmail.ts`
- Test: `src/server/services/gmail.test.ts`

The pure parts (`buildGmailQuery`, `resolveSenders`) are unit-tested. The network functions (`listJobMessageIds`, `getMessage`) use `fetch` against the Gmail REST API and are verified manually — same convention as `getGmailProfile` already in this file.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/gmail.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    buildGmailQuery,
    DEFAULT_BOLSA_SENDERS,
    resolveSenders,
} from "@/server/services/gmail";

describe("buildGmailQuery", () => {
    it("joins senders with OR and applies the day window", () => {
        const q = buildGmailQuery(["a@x.com", "b@y.com"], 90);
        expect(q).toBe("from:(a@x.com OR b@y.com) newer_than:90d");
    });

    it("trims and drops blank senders", () => {
        const q = buildGmailQuery([" a@x.com ", ""], 30);
        expect(q).toBe("from:(a@x.com) newer_than:30d");
    });
});

describe("resolveSenders", () => {
    it("parses a comma-separated env string", () => {
        expect(resolveSenders("a@x.com, b@y.com")).toEqual([
            "a@x.com",
            "b@y.com",
        ]);
    });

    it("falls back to the default when undefined or empty", () => {
        expect(resolveSenders(undefined)).toEqual(DEFAULT_BOLSA_SENDERS);
        expect(resolveSenders("   ")).toEqual(DEFAULT_BOLSA_SENDERS);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/services/gmail.test.ts`
Expected: FAIL — `buildGmailQuery`/`resolveSenders`/`DEFAULT_BOLSA_SENDERS` are not exported.

- [ ] **Step 3: Extend the implementation**

Append to `src/server/services/gmail.ts` (keep the existing imports; add the `gmail-parse` import at the top with the others):

```ts
import {
    extractMessageText,
    type GmailMessageResponse,
    getHeader,
} from "./gmail-parse";
```

Then append at the end of the file:

```ts
export const DEFAULT_BOLSA_SENDERS = ["bolsadetrabajo@unsa.edu.pe"];
export const INGEST_NEWER_THAN_DAYS = 90;
export const INGEST_MAX_MESSAGES = 50;

export interface ParsedGmailMessage {
    id: string;
    sender: string | null;
    subject: string | null;
    date: string | null;
    text: string;
}

export function resolveSenders(configured: string | undefined): string[] {
    const parsed = (configured ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return parsed.length > 0 ? parsed : DEFAULT_BOLSA_SENDERS;
}

export function buildGmailQuery(
    senders: string[],
    newerThanDays: number,
): string {
    const from = senders
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join(" OR ");
    return `from:(${from}) newer_than:${newerThanDays}d`;
}

export async function listJobMessageIds(
    accessToken: string,
    query: string,
    maxResults: number,
): Promise<string[]> {
    const url = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(
    accessToken: string,
    messageId: string,
): Promise<ParsedGmailMessage> {
    const url = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    );
    url.searchParams.set("format", "full");
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new GmailApiError(res.status);
    }
    const msg = (await res.json()) as GmailMessageResponse;
    const headers = msg.payload?.headers;
    return {
        id: msg.id,
        sender: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        text: extractMessageText(msg.payload),
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/services/gmail.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/gmail.ts src/server/services/gmail.test.ts
git commit -m "feat: Gmail message list/get + query builder"
```

---

## Task 4: Email classification (Gemini)

**Files:**
- Create: `src/server/ai/classify-email.ts`
- Test: `src/server/ai/classify-email.test.ts`

`classifyEmail` (the network call) is manually verified; the zod parse fn is unit-tested — mirrors `extract-profile.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/ai/classify-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseClassifiedEmail } from "@/server/ai/classify-email";

describe("parseClassifiedEmail", () => {
    it("parses a job classification", () => {
        const c = parseClassifiedEmail(
            JSON.stringify({ is_job: true, noise_reason: "" }),
        );
        expect(c.is_job).toBe(true);
        expect(c.noise_reason).toBe("");
    });

    it("parses a noise classification with a reason", () => {
        const c = parseClassifiedEmail(
            JSON.stringify({ is_job: false, noise_reason: "evento" }),
        );
        expect(c.is_job).toBe(false);
        expect(c.noise_reason).toBe("evento");
    });

    it("throws when is_job is missing", () => {
        expect(() =>
            parseClassifiedEmail(JSON.stringify({ noise_reason: "x" })),
        ).toThrow();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/ai/classify-email.test.ts`
Expected: FAIL — `Cannot find module '@/server/ai/classify-email'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/ai/classify-email.ts`:

```ts
import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const classifiedEmailSchema = z.object({
    is_job: z.boolean(),
    noise_reason: z.string(),
});

export type ClassifiedEmail = z.infer<typeof classifiedEmailSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        is_job: { type: Type.BOOLEAN },
        noise_reason: { type: Type.STRING },
    },
    propertyOrdering: ["is_job", "noise_reason"],
    required: ["is_job", "noise_reason"],
};

const PROMPT =
    "Clasifica si el correo es una oferta laboral real (vacante de empleo o " +
    "práctica) dirigida a egresados universitarios. Responde SOLO con JSON " +
    "según el schema. 'is_job'=true únicamente si describe una vacante concreta. " +
    "Si es ruido (newsletter, evento, webinar, encuesta, aviso administrativo, " +
    "felicitación, publicidad) pon 'is_job'=false y 'noise_reason' con una razón " +
    "breve en una o dos palabras (p.ej. 'evento', 'encuesta', 'publicidad'). " +
    "Si 'is_job'=true deja 'noise_reason' como cadena vacía.";

export function parseClassifiedEmail(jsonText: string): ClassifiedEmail {
    return classifiedEmailSchema.parse(JSON.parse(jsonText));
}

export async function classifyEmail(
    emailText: string,
): Promise<ClassifiedEmail> {
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ text: PROMPT }, { text: emailText }],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty classification");
    }
    return parseClassifiedEmail(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/ai/classify-email.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/classify-email.ts src/server/ai/classify-email.test.ts
git commit -m "feat: Gemini email job-vs-noise classifier"
```

---

## Task 5: Job extraction (Gemini)

**Files:**
- Create: `src/server/ai/extract-job.ts`
- Test: `src/server/ai/extract-job.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/ai/extract-job.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseExtractedJob } from "@/server/ai/extract-job";

const VALID = JSON.stringify({
    titulo: "Practicante de Backend",
    empresa: "Acme S.A.C.",
    modalidad: "remoto",
    ubicacion: "Arequipa",
    salario: {
        min: 1500,
        max: 1800,
        moneda: "PEN",
        periodo: "mes",
        explicito: true,
    },
    requisitos: "Node.js, SQL",
    skills: ["Node.js", "SQL"],
    deadline: "2026-07-01",
    apply_link: "https://acme.test/apply",
});

describe("parseExtractedJob", () => {
    it("parses a fully populated vacancy", () => {
        const j = parseExtractedJob(VALID);
        expect(j.titulo).toBe("Practicante de Backend");
        expect(j.salario.min).toBe(1500);
        expect(j.salario.explicito).toBe(true);
        expect(j.skills).toEqual(["Node.js", "SQL"]);
    });

    it("accepts null salary amounts, deadline and apply_link", () => {
        const j = parseExtractedJob(
            JSON.stringify({
                titulo: "Analista",
                empresa: "X",
                modalidad: "presencial",
                ubicacion: "Lima",
                salario: {
                    min: null,
                    max: null,
                    moneda: null,
                    periodo: null,
                    explicito: false,
                },
                requisitos: "",
                skills: [],
                deadline: null,
                apply_link: null,
            }),
        );
        expect(j.salario.min).toBeNull();
        expect(j.deadline).toBeNull();
        expect(j.apply_link).toBeNull();
    });

    it("throws when a required field is missing", () => {
        expect(() =>
            parseExtractedJob(JSON.stringify({ titulo: "X" })),
        ).toThrow();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/ai/extract-job.test.ts`
Expected: FAIL — `Cannot find module '@/server/ai/extract-job'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/ai/extract-job.ts`:

```ts
import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const extractedSalarioSchema = z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    moneda: z.string().nullable(),
    periodo: z.string().nullable(),
    explicito: z.boolean(),
});

export const extractedJobSchema = z.object({
    titulo: z.string(),
    empresa: z.string(),
    modalidad: z.string(),
    ubicacion: z.string(),
    salario: extractedSalarioSchema,
    requisitos: z.string(),
    skills: z.array(z.string()),
    deadline: z.string().nullable(),
    apply_link: z.string().nullable(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type ExtractedSalario = z.infer<typeof extractedSalarioSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titulo: { type: Type.STRING },
        empresa: { type: Type.STRING },
        modalidad: { type: Type.STRING },
        ubicacion: { type: Type.STRING },
        salario: {
            type: Type.OBJECT,
            properties: {
                min: { type: Type.NUMBER, nullable: true },
                max: { type: Type.NUMBER, nullable: true },
                moneda: { type: Type.STRING, nullable: true },
                periodo: { type: Type.STRING, nullable: true },
                explicito: { type: Type.BOOLEAN },
            },
            propertyOrdering: ["min", "max", "moneda", "periodo", "explicito"],
            required: ["min", "max", "moneda", "periodo", "explicito"],
        },
        requisitos: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        deadline: { type: Type.STRING, nullable: true },
        apply_link: { type: Type.STRING, nullable: true },
    },
    propertyOrdering: [
        "titulo",
        "empresa",
        "modalidad",
        "ubicacion",
        "salario",
        "requisitos",
        "skills",
        "deadline",
        "apply_link",
    ],
    required: [
        "titulo",
        "empresa",
        "modalidad",
        "ubicacion",
        "salario",
        "requisitos",
        "skills",
        "deadline",
        "apply_link",
    ],
};

const PROMPT =
    "Extrae la vacante laboral del correo y responde SOLO con JSON según el " +
    "schema. 'modalidad' debe ser una de: presencial, remoto, hibrido. 'moneda' " +
    "debe ser PEN o USD si se conoce; si no, null. 'periodo' uno de: mes, hora, " +
    "anio si se conoce; si no, null. Para 'salario.explicito' pon true SOLO si el " +
    "correo da un monto concreto; pon false si dice 'según mercado', 'a tratar', " +
    "'remuneración competitiva' o no menciona monto, y deja min/max en null en ese " +
    "caso. 'deadline' en formato YYYY-MM-DD o null. 'skills' es una lista de " +
    "tecnologías o competencias. Si un dato no aparece usa cadena vacía, lista " +
    "vacía o null según el tipo.";

export function parseExtractedJob(jsonText: string): ExtractedJob {
    return extractedJobSchema.parse(JSON.parse(jsonText));
}

export async function extractJob(emailText: string): Promise<ExtractedJob> {
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ text: PROMPT }, { text: emailText }],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty job extraction");
    }
    return parseExtractedJob(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/ai/extract-job.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/extract-job.ts src/server/ai/extract-job.test.ts
git commit -m "feat: Gemini structured vacancy extraction"
```

---

## Task 6: Salary normalization (pure)

**Files:**
- Create: `src/server/services/salary.ts`
- Test: `src/server/services/salary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/salary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    detectSalaryFromText,
    normalizeMoneda,
    normalizeSalary,
} from "@/server/services/salary";

describe("normalizeMoneda", () => {
    it("maps soles markers to PEN and dollar markers to USD", () => {
        expect(normalizeMoneda("soles")).toBe("PEN");
        expect(normalizeMoneda("S/")).toBe("PEN");
        expect(normalizeMoneda("USD")).toBe("USD");
        expect(normalizeMoneda("dólares")).toBe("USD");
    });

    it("returns null for unknown or empty", () => {
        expect(normalizeMoneda(null)).toBeNull();
        expect(normalizeMoneda("xyz")).toBeNull();
    });
});

describe("detectSalaryFromText", () => {
    it("detects a single soles amount with the S/ marker", () => {
        const s = detectSalaryFromText("Sueldo S/ 1500 mensual");
        expect(s).not.toBeNull();
        expect(s?.salarioMin).toBe(1500);
        expect(s?.moneda).toBe("PEN");
        expect(s?.salarioExplicito).toBe(true);
    });

    it("detects a soles range with trailing word", () => {
        const s = detectSalaryFromText("Entre 1200 y 1800 soles");
        expect(s?.salarioMin).toBe(1200);
        expect(s?.salarioMax).toBe(1800);
        expect(s?.moneda).toBe("PEN");
    });

    it("detects a USD amount", () => {
        const s = detectSalaryFromText("Pago USD 800 al mes");
        expect(s?.salarioMin).toBe(800);
        expect(s?.moneda).toBe("USD");
    });

    it("handles thousands separators", () => {
        const s = detectSalaryFromText("Remuneración S/ 2,000");
        expect(s?.salarioMin).toBe(2000);
    });

    it("returns null when there is no amount", () => {
        expect(detectSalaryFromText("Remuneración según mercado")).toBeNull();
    });

    it("ignores a bare year without a currency marker", () => {
        expect(detectSalaryFromText("Convocatoria 2026 para egresados")).toBeNull();
    });
});

describe("normalizeSalary", () => {
    it("trusts the LLM when it reports an explicit amount", () => {
        const out = normalizeSalary(
            { min: 2500, max: 3000, moneda: "PEN", periodo: "mes", explicito: true },
            "irrelevante",
        );
        expect(out.salarioMin).toBe(2500);
        expect(out.salarioMax).toBe(3000);
        expect(out.salarioExplicito).toBe(true);
        expect(out.moneda).toBe("PEN");
    });

    it("falls back to regex when the LLM is not explicit", () => {
        const out = normalizeSalary(
            { min: null, max: null, moneda: null, periodo: null, explicito: false },
            "El sueldo es S/ 1600 mensuales",
        );
        expect(out.salarioMin).toBe(1600);
        expect(out.moneda).toBe("PEN");
        expect(out.salarioExplicito).toBe(true);
    });

    it("marks not explicit when neither LLM nor regex find an amount", () => {
        const out = normalizeSalary(
            { min: null, max: null, moneda: null, periodo: "mes", explicito: false },
            "Remuneración a tratar",
        );
        expect(out.salarioMin).toBeNull();
        expect(out.salarioExplicito).toBe(false);
        expect(out.salarioPeriodo).toBe("mes");
    });

    it("rounds a fractional LLM amount", () => {
        const out = normalizeSalary(
            { min: 1500.6, max: null, moneda: "PEN", periodo: "mes", explicito: true },
            "x",
        );
        expect(out.salarioMin).toBe(1501);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/services/salary.test.ts`
Expected: FAIL — `Cannot find module '@/server/services/salary'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/salary.ts`:

```ts
import type { ExtractedSalario } from "@/server/ai/extract-job";

export interface NormalizedSalary {
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
}

const PEN_HINT = /(s\/\.?|soles|\bpen\b)/i;
const USD_HINT = /(us\$|\busd\b|d[óo]lares|\$)/i;

// A plausible monthly/annual salary amount — filters out years, phone digits, etc.
function isPlausible(n: number): boolean {
    return Number.isFinite(n) && n >= 100 && n <= 1_000_000;
}

function parseAmount(raw: string): number {
    return Number.parseInt(raw.replace(/[.,\s]/g, ""), 10);
}

export function normalizeMoneda(raw: string | null): string | null {
    if (!raw) {
        return null;
    }
    if (USD_HINT.test(raw)) {
        return "USD";
    }
    if (PEN_HINT.test(raw)) {
        return "PEN";
    }
    return null;
}

// Matches 1500, 2,000, 1.500 (3+ digit groups or a single bare number).
const AMOUNT = String.raw`(\d[\d.,]*\d|\d)`;
const RANGE_RE = new RegExp(`${AMOUNT}\\s*(?:-|–|a|hasta|y)\\s*${AMOUNT}`, "i");
const BEFORE_RE = new RegExp(`(?:s/\\.?|us\\$|usd|\\$)\\s*${AMOUNT}`, "i");
const AFTER_RE = new RegExp(`${AMOUNT}\\s*(?:soles|pen|d[óo]lares|usd)`, "i");

export function detectSalaryFromText(text: string): NormalizedSalary | null {
    const moneda = normalizeMoneda(text);

    const range = text.match(RANGE_RE);
    if (range) {
        const min = parseAmount(range[1]);
        const max = parseAmount(range[2]);
        if (isPlausible(min) && isPlausible(max)) {
            return {
                salarioMin: min,
                salarioMax: max,
                moneda,
                salarioPeriodo: null,
                salarioExplicito: true,
            };
        }
    }

    const single = text.match(BEFORE_RE) ?? text.match(AFTER_RE);
    if (single) {
        const val = parseAmount(single[1]);
        if (isPlausible(val)) {
            return {
                salarioMin: val,
                salarioMax: null,
                moneda,
                salarioPeriodo: null,
                salarioExplicito: true,
            };
        }
    }

    return null;
}

// Reconcile the LLM salary block with a deterministic regex fallback.
// Trust the LLM only when it claims an explicit numeric amount; otherwise
// let the regex decide. No amount anywhere -> explicito=false.
export function normalizeSalary(
    llm: ExtractedSalario,
    rawText: string,
): NormalizedSalary {
    if (llm.explicito && llm.min != null) {
        return {
            salarioMin: Math.round(llm.min),
            salarioMax: llm.max != null ? Math.round(llm.max) : null,
            moneda: normalizeMoneda(llm.moneda),
            salarioPeriodo: llm.periodo,
            salarioExplicito: true,
        };
    }

    const detected = detectSalaryFromText(rawText);
    if (detected) {
        return { ...detected, salarioPeriodo: llm.periodo };
    }

    return {
        salarioMin: llm.min != null ? Math.round(llm.min) : null,
        salarioMax: llm.max != null ? Math.round(llm.max) : null,
        moneda: normalizeMoneda(llm.moneda),
        salarioPeriodo: llm.periodo,
        salarioExplicito: false,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/services/salary.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/salary.ts src/server/services/salary.test.ts
git commit -m "feat: deterministic salary normalization with regex fallback"
```

---

## Task 7: Dedupe hashing (pure)

**Files:**
- Create: `src/server/services/dedupe.ts`
- Test: `src/server/services/dedupe.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/dedupe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    computeDedupeHash,
    normalizeTitle,
    weekKey,
} from "@/server/services/dedupe";

describe("normalizeTitle", () => {
    it("lowercases, strips accents and punctuation, collapses spaces", () => {
        expect(normalizeTitle("  Práctica   de  Backend! ")).toBe(
            "practica de backend",
        );
    });
});

describe("weekKey", () => {
    it("returns the same key for two dates in the same ISO week", () => {
        // 2026-06-08 (Mon) and 2026-06-13 (Sat) are the same ISO week.
        expect(weekKey("2026-06-08")).toBe(weekKey("2026-06-13"));
    });

    it("returns a different key for the next week", () => {
        expect(weekKey("2026-06-13")).not.toBe(weekKey("2026-06-15"));
    });

    it("returns a YYYY-Www formatted string", () => {
        expect(weekKey("2026-06-13")).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("returns 'nodate' for an unparseable date", () => {
        expect(weekKey("not-a-date")).toBe("nodate");
    });
});

describe("computeDedupeHash", () => {
    it("is stable for the same inputs", () => {
        const a = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        expect(a).toBe(b);
    });

    it("ignores case and accents in titulo/empresa", () => {
        const a = computeDedupeHash({
            titulo: "Práctica Backend",
            empresa: "Acmé",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "practica backend",
            empresa: "acme",
            weekDate: "2026-06-13",
        });
        expect(a).toBe(b);
    });

    it("differs when the title differs", () => {
        const a = computeDedupeHash({
            titulo: "Backend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        const b = computeDedupeHash({
            titulo: "Frontend Dev",
            empresa: "Acme",
            weekDate: "2026-06-13",
        });
        expect(a).not.toBe(b);
    });

    it("handles a null weekDate without throwing", () => {
        const h = computeDedupeHash({
            titulo: "X",
            empresa: "Y",
            weekDate: null,
        });
        expect(h).toHaveLength(64);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/services/dedupe.test.ts`
Expected: FAIL — `Cannot find module '@/server/services/dedupe'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/dedupe.ts`:

```ts
import { createHash } from "node:crypto";

export function normalizeTitle(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ISO 8601 year-week (e.g. "2026-W24") of a YYYY-MM-DD date string.
// Deterministic: the caller supplies the date, never `now`.
export function weekKey(isoDate: string): string {
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return "nodate";
    }
    const date = new Date(
        Date.UTC(
            parsed.getUTCFullYear(),
            parsed.getUTCMonth(),
            parsed.getUTCDate(),
        ),
    );
    // Shift to the Thursday of this ISO week.
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const isoYear = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week =
        1 +
        Math.round(
            (date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000),
        );
    return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function computeDedupeHash(input: {
    titulo: string;
    empresa: string;
    weekDate: string | null;
}): string {
    const key = [
        normalizeTitle(input.titulo),
        normalizeTitle(input.empresa),
        input.weekDate ? weekKey(input.weekDate) : "nodate",
    ].join("|");
    return createHash("sha256").update(key).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/services/dedupe.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/dedupe.ts src/server/services/dedupe.test.ts
git commit -m "feat: deterministic dedupe hashing (title+empresa+week)"
```

---

## Task 8: Ingestion orchestrator + persistence

**Files:**
- Create: `src/server/services/ingestion.ts`
- Test: `src/server/services/ingestion.test.ts`

The pure helpers (`buildJobEmbeddingText`, `coerceIsoDate`, `toIsoDate`) and the DB-touching pieces (`persistJob`, `getLastIngestionRun`) are tested. `runIngestion` calls Gmail + Gemini and is verified manually (it composes already-tested units).

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/ingestion.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import {
    buildJobEmbeddingText,
    coerceIsoDate,
    getLastIngestionRun,
    persistJob,
    toIsoDate,
} from "@/server/services/ingestion";

const TEST_USER_ID = "spec04-ingestion-test-user";

function fakeEmbedding(): number[] {
    return Array.from({ length: 768 }, () => 0.02);
}

function jobRow(overrides: Partial<typeof jobs.$inferInsert>) {
    return {
        userId: TEST_USER_ID,
        gmailMsgId: "msg-1",
        titulo: "Backend Dev",
        empresa: "Acme",
        dedupeHash: "hash-a",
        embedding: fakeEmbedding(),
        ...overrides,
    };
}

describe("buildJobEmbeddingText", () => {
    it("joins titulo, requisitos and skills, skipping empties", () => {
        expect(
            buildJobEmbeddingText({
                titulo: "Backend Dev",
                requisitos: "Node, SQL",
                skills: ["Node", "SQL"],
            }),
        ).toBe("Backend Dev Node, SQL Node, SQL");
    });

    it("omits blank segments", () => {
        expect(
            buildJobEmbeddingText({
                titulo: "Backend Dev",
                requisitos: "",
                skills: [],
            }),
        ).toBe("Backend Dev");
    });
});

describe("coerceIsoDate", () => {
    it("keeps a valid YYYY-MM-DD", () => {
        expect(coerceIsoDate("2026-07-01")).toBe("2026-07-01");
    });
    it("rejects anything else", () => {
        expect(coerceIsoDate("01/07/2026")).toBeNull();
        expect(coerceIsoDate(null)).toBeNull();
    });
});

describe("toIsoDate", () => {
    it("converts an RFC-2822 header date to YYYY-MM-DD", () => {
        expect(toIsoDate("Sat, 13 Jun 2026 10:00:00 -0500")).toBe("2026-06-13");
    });
    it("returns null for null or junk", () => {
        expect(toIsoDate(null)).toBeNull();
        expect(toIsoDate("nope")).toBeNull();
    });
});

describe("persistJob + getLastIngestionRun", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("inserts a new job and dedupes on conflict", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Ingestion Test",
            email: "spec04-ingestion-test@example.com",
            emailVerified: false,
        });

        const first = await persistJob(jobRow({}));
        expect(first).toBe(true);

        // Same (userId, dedupeHash) -> conflict -> not inserted.
        const dupe = await persistJob(
            jobRow({ gmailMsgId: "msg-2", dedupeHash: "hash-a" }),
        );
        expect(dupe).toBe(false);

        // Same (userId, gmailMsgId) -> conflict -> not inserted.
        const sameMsg = await persistJob(
            jobRow({ gmailMsgId: "msg-1", dedupeHash: "hash-b" }),
        );
        expect(sameMsg).toBe(false);

        // A genuinely new job inserts.
        const second = await persistJob(
            jobRow({ gmailMsgId: "msg-3", dedupeHash: "hash-c" }),
        );
        expect(second).toBe(true);

        const rows = await db
            .select()
            .from(jobs)
            .where(eq(jobs.userId, TEST_USER_ID));
        expect(rows).toHaveLength(2);
    });

    it("returns null when the user has no ingestion runs", async () => {
        const run = await getLastIngestionRun("spec04-no-such-user");
        expect(run).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/services/ingestion.test.ts`
Expected: FAIL — `Cannot find module '@/server/services/ingestion'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/ingestion.ts`:

```ts
import { getLogger } from "@logtape/logtape";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { classifyEmail } from "@/server/ai/classify-email";
import { type ExtractedJob, extractJob } from "@/server/ai/extract-job";
import { embedText } from "@/server/ai/embed";
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
    const [run] = await db
        .insert(ingestionRuns)
        .values({ userId })
        .returning();

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
    return finished;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/services/ingestion.test.ts`
Expected: PASS (8 tests; the DB tests require the dev Postgres on :5433 — already used by spec-02/03 tests).

- [ ] **Step 5: Verify check is clean**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ingestion.ts src/server/services/ingestion.test.ts
git commit -m "feat: ingestion orchestrator + job persistence + run metrics"
```

---

## Task 9: Ingest router + mount

**Files:**
- Create: `src/server/routers/ingest.ts`
- Test: `src/server/routers/ingest.test.ts`
- Modify: `src/server/router.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/routers/ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/ingest (auth gating)", () => {
    it("POST /ingest returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/ingest", { method: "POST" }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /ingest/last returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/ingest/last"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/routers/ingest.test.ts`
Expected: FAIL — the routes 404 (return `{ code: "NOT_FOUND" }`) because `ingestRouter` is not mounted yet.

- [ ] **Step 3: Write the router**

Create `src/server/routers/ingest.ts`:

```ts
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    GmailApiError,
    GmailNotConnectedError,
    getGoogleAccessToken,
} from "@/server/services/gmail";
import { getLastIngestionRun, runIngestion } from "@/server/services/ingestion";

export const ingestRouter = new Elysia({ prefix: "/ingest" })
    .post("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            const run = await runIngestion({
                userId: session.user.id,
                accessToken: token,
            });
            return { run };
        } catch (e) {
            if (
                e instanceof GmailNotConnectedError ||
                (e instanceof GmailApiError &&
                    (e.status === 401 || e.status === 403))
            ) {
                return status(400, { code: "gmail_not_connected" });
            }
            throw e;
        }
    })
    .get("/last", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const run = await getLastIngestionRun(session.user.id);
        return { run };
    });
```

- [ ] **Step 4: Mount the router**

In `src/server/router.ts`, add the import alongside the others:

```ts
import { ingestRouter } from "@/server/routers/ingest";
```

And add `.use(ingestRouter)` to the chain after `.use(profileRouter)`:

```ts
    .use(healthRouter)
    .use(meRouter)
    .use(gmailRouter)
    .use(profileRouter)
    .use(ingestRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/server/routers/ingest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite + check + build**

Run: `pnpm vitest run`
Expected: PASS (all spec 00–04 tests).

Run: `pnpm check`
Expected: exit 0.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/ingest.ts src/server/routers/ingest.test.ts src/server/router.ts
git commit -m "feat: ingest router (POST /ingest, GET /ingest/last) at /api/v1/ingest"
```

---

## Manual verification (Gemini + Gmail, after Task 9)

These exercise the network paths the automated suite intentionally skips. Run against a test Gmail with seeded bolsa emails:

1. Connect the test Gmail (spec-01 flow), ensure `BOLSA_SENDERS` matches the seeded sender (or seed from the default `bolsadetrabajo@unsa.edu.pe`).
2. `POST /api/v1/ingest` while authenticated → response `{ run: { emailsScanned, jobsFound, noiseFiltered, dupesRemoved } }` with non-zero, coherent numbers.
3. Inspect the DB: `jobs` rows have standardized fields, `salario_explicito` set correctly (true only when an amount is present), 768-dim `embedding`, and `raw_email` ≤ 2000 chars.
4. `POST /api/v1/ingest` again → second run reports `emailsScanned: 0` (everything already ingested); no duplicate `jobs` rows appear → idempotency confirmed.
5. `GET /api/v1/ingest/last` → returns the most recent run for the impact panel.
6. `pnpm check` clean.

---

## Self-Review

**Spec coverage:**
- Recuperación vía Gmail (read-only, `from:(SENDERS) newer_than:90d`, skip already-ingested) → Tasks 1, 3, 8 (`existingMsgIds`).
- Clasificación empleo-vs-ruido (Gemini, mata 27% ruido) → Task 4; `noise_filtered` counted in Task 8.
- Extracción estructurada (Gemini JSON schema) → Task 5.
- Normalización de salario (LLM + fallback regex, `explicito`) → Task 6.
- Dedupe `hash(titulo+empresa+semana)` + `unique(user,dedupe_hash)` + `dupes_removed` → Tasks 7, 8.
- Embedding por vacante @768 → Task 8 (`buildJobEmbeddingText` + `embedText`).
- Métricas `ingestion_runs` (emails_scanned/jobs_found/noise_filtered/dupes_removed + tiempos) → Task 8.
- Endpoints `POST /ingest`, `GET /ingest/last` → Task 9.
- Procesar tolerando fallos por correo → Task 8 (per-message try/catch).
- Seguridad: read-only, `raw_email` recortado, sin loguear cuerpos/tokens, aislamiento por user_id → Tasks 3, 8 (RAW_EMAIL_MAX_CHARS, log only id+message, all queries filtered by userId).
- Fuera de alcance (match/rerank, scraping, dedupe global) → not touched. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has full code. ✅

**Type consistency:**
- `ExtractedSalario`/`ExtractedJob` (Task 5) consumed by `normalizeSalary` (Task 6) and `ingestOneJob` (Task 8) — field names (`min/max/moneda/periodo/explicito`, `salario`, `apply_link`, `deadline`) match.
- `NormalizedSalary` fields (`salarioMin/salarioMax/moneda/salarioPeriodo/salarioExplicito`) map 1:1 onto `jobs` columns in `persistJob`. ✅
- `ParsedGmailMessage` (Task 3) consumed by `ingestOneJob`/`runIngestion` (Task 8) — `id/sender/date/text` used consistently. ✅
- `buildGmailQuery`, `resolveSenders`, `INGEST_*`, `getMessage`, `listJobMessageIds` exported in Task 3, imported in Task 8. ✅
- `computeDedupeHash({titulo, empresa, weekDate})` signature (Task 7) matches the Task 8 call. ✅
- No migration referenced (jobs/ingestion_runs already exist). ✅
