# Spec 03 — Perfil del egresado (CV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El egresado sube su CV (PDF); Gemini extrae un perfil estructurado, se persiste/edita por usuario, y se genera el embedding `vector(768)` del perfil — dejando una fila `profiles` completa.

**Architecture:** Gemini se accede mediante el SDK `@google/genai` desde nuevos módulos en `src/server/ai/` (cliente singleton + extracción multimodal de PDF + embeddings). La lógica de perfil (upsert/get/update + composición del texto de embedding) vive en `src/server/services/profile.ts`; el almacenamiento del PDF en `src/server/services/cv-storage.ts`. Un router Elysia `src/server/routers/profile.ts` (prefix `/profile`) expone `POST /cv`, `GET /`, `PUT /`, todos autenticados y aislados por `user_id`. Handlers finos: parse → service → return.

**Tech Stack:** `@google/genai` (`gemini-2.5-flash` extracción multimodal PDF, `gemini-embedding-2` @768 embeddings), Elysia (multipart `t.File`), Drizzle (`onConflictDoUpdate` upsert), zod (validación de la salida del modelo), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-13-spec-03-profile-cv.md`

---

## Decisions / notes (review first)

- **DOS COLUMNAS NUEVAS en `profiles` (migración 0002).** La extracción devuelve `skills[]` y `experiencia_resumen`, y el texto de embedding del spec los usa (`[escuela, skills, experiencia, intereses]`). Para recomputar el embedding al editar (criterio de aceptación) hay que persistirlos. Se añaden `skills text[]` y `experiencia_resumen text` a la tabla `profiles` (Spec 02 definió la base; Spec 03 es dueño del contenido del perfil). Es una migración aditiva limpia. **Si prefieres no tocar el schema de Spec 02, dilo y los guardo dentro de `raw_cv_text` como JSON** — pero columnas es más limpio para Specs 05/06.
- **Modelo de embeddings:** `gemini-embedding-2` con `outputDimensionality: 768`. Este modelo **auto-normaliza** los embeddings truncados, así que la distancia coseno (HNSW `vector_cosine_ops` de Spec 02) funciona sin normalización manual. (Con `gemini-embedding-001` habría que L2-normalizar a mano; no lo usamos.)
- **Salida del modelo SIEMPRE estructurada:** `generateContent` con `responseMimeType: "application/json"` + `responseSchema` (enum `Type` del SDK). Se re-valida con zod (`parseExtractedProfile`) antes de tocar la DB; nunca se parsea texto libre.
- **Ruta real versionada:** el spec escribe `/api/profile/...` como abreviatura; con el `prefix: "/api/v1"` del app y `prefix: "/profile"` del router, las rutas reales son `/api/v1/profile/cv`, `/api/v1/profile`.
- **Almacenamiento del PDF: disco local en dev** (`uploads/cv/<userId>.pdf`, gitignored), `cv_url` = ruta relativa. Aislado en `cv-storage.ts` para cambiar a blob en producción (fuera de alcance MVP — Vercel serverless es efímero; se documenta).
- **Verificación de Gemini es MANUAL** (requiere `GEMINI_API_KEY` real + un CV real), igual que la verificación de OAuth en Spec 01. Los tests automatizados cubren las partes deterministas: validación de dimensión del embedding, parseo de la extracción, composición del texto, upsert/get contra la DB de dev, y el gating 401 del router. Las funciones que llaman a la red (`extractProfileFromPdf`, `embedText`) se verifican a mano.
- **No loguear contenido del CV ni del perfil** (AGENTS.md / spec). Per-user isolation: toda query filtra por `user_id`.
- **`@t3-oss/env-nextjs`** ya valida `GEMINI_API_KEY` (`z.string().min(1)`); `test-setup.ts` carga `.env.example` (placeholder válido), así el cliente genai se construye en tests sin llamar a la red.

## File Structure

- `package.json` — añade dependencia `@google/genai`.
- `src/config/server-config.ts` — añade `gemini: { apiKey }`.
- `src/server/ai/client.ts` — singleton `GoogleGenAI` + constantes de modelo/dimensión.
- `src/server/ai/embed.ts` — `embedText(text) → number[768]` + `toEmbeddingVector` (guard puro).
- `src/server/ai/extract-profile.ts` — `extractProfileFromPdf(bytes)` + `responseSchema` + zod `extractedProfileSchema` + `parseExtractedProfile`.
- `src/server/services/cv-storage.ts` — `saveCvPdf(userId, bytes) → cvUrl` (disco local).
- `src/server/services/profile.ts` — `buildProfileEmbeddingText`, `getProfile`, `upsertProfileFromCv`, `updateProfileFields`, orquestadores `processCvAndSaveProfile`/`editProfile`, `ProfileNotFoundError`.
- `src/server/routers/profile.ts` — router Elysia (`POST /cv`, `GET /`, `PUT /`).
- `src/server/router.ts` — `.use(profileRouter)`.
- `src/server/drizzle/schemas/profiles.ts` — +`skills`, +`experienciaResumen` (Task 1).
- `drizzle/0002_*.sql` (+ meta) — migración aditiva (Task 1).
- Tests: `src/server/ai/embed.test.ts`, `src/server/ai/extract-profile.test.ts`, `src/server/services/profile.test.ts`, `src/server/routers/profile.test.ts`.
- `.gitignore` — `uploads/`.

---

### Task 1: Extender `profiles` (skills + experiencia_resumen) + migración 0002

**Files:**
- Modify: `src/server/drizzle/schemas/profiles.ts`
- Create: `drizzle/0002_*.sql` (+ `drizzle/meta/` por drizzle-kit)

- [ ] **Step 1: Añadir las dos columnas a `profiles.ts`**

Inserta `skills` y `experienciaResumen` justo después de `intereses` (mantén el resto igual):

```ts
    intereses: text("intereses").array(),
    skills: text("skills").array(),
    experienciaResumen: text("experiencia_resumen"),
    expectativaSalarial: integer("expectativa_salarial"),
```

(El archivo completo queda con: `userId` PK, `escuelaProfesional`, `grado`, `ubicacion`, `intereses`, `skills`, `experienciaResumen`, `expectativaSalarial`, `cvUrl`, `rawCvText`, `embedding`, `createdAt`, `updatedAt`. Los tipos `Profile`/`NewProfile` ya se infieren — no se tocan.)

- [ ] **Step 2: Generar la migración**

Run: `pnpm db:generate`
Expected: nueva migración `drizzle/0002_<name>.sql` con `ALTER TABLE "profiles" ADD COLUMN "skills" text[];` y `ADD COLUMN "experiencia_resumen" text;` + snapshot `0002` y `_journal.json` actualizado. (Solo ALTERs; ninguna otra tabla cambia.)

- [ ] **Step 3: Aplicar la migración**

Run: `pnpm db:migrate`
Expected: aplica limpio en la DB de :5433; `profiles` ahora tiene las columnas `skills` (ARRAY) y `experiencia_resumen` (text).

- [ ] **Step 4: Verificar columnas**

Run:
```bash
pnpm dlx tsx --env-file=.env.local -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const c=await sql\`select column_name, data_type from information_schema.columns where table_name='profiles' and column_name in ('skills','experiencia_resumen') order by column_name\`; console.log(c); await sql.end();"
```
Expected: `skills` (`ARRAY`) y `experiencia_resumen` (`text`) presentes.
> NOTA: si el inline `-e` falla por top-level await (esbuild→CJS, limitación del harness), escribe la misma query en un archivo temporal `tmp-verify.mts`, ejecútalo con `pnpm dlx tsx --env-file=.env.local tmp-verify.mts`, y bórralo. Esto ya pasó en Spec 02.

- [ ] **Step 5: `pnpm check`**

Run: `pnpm check`
Expected: limpio (biome + tsc). El schema sigue tipando.

- [ ] **Step 6: Commit**

```bash
git add src/server/drizzle/schemas/profiles.ts drizzle/
git commit -m "feat: add skills + experiencia_resumen columns to profiles"
```
(Añade línea en blanco + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` a cada commit.)

---

### Task 2: Cliente Gemini + config + dependencia

**Files:**
- Modify: `package.json` (vía `pnpm add`)
- Modify: `src/config/server-config.ts`
- Create: `src/server/ai/client.ts`

- [ ] **Step 1: Instalar el SDK**

Run: `pnpm add @google/genai`
Expected: `@google/genai` aparece en `dependencies`; `pnpm-lock.yaml` actualizado.

- [ ] **Step 2: Añadir `gemini` a `ServerConfig`**

En `src/config/server-config.ts`, añade la clave `gemini` (deja `baseUrl` y `google` igual):

```ts
import { env } from "./env";

export const ServerConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    gemini: {
        apiKey: env.GEMINI_API_KEY,
    },
} as const;
```

- [ ] **Step 3: Crear `src/server/ai/client.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { ServerConfig } from "@/config/server-config";

export const genai = new GoogleGenAI({ apiKey: ServerConfig.gemini.apiKey });

export const GEMINI_FLASH_MODEL = "gemini-2.5-flash";
export const GEMINI_EMBED_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIM = 768;
```

- [ ] **Step 4: `pnpm check`**

Run: `pnpm check`
Expected: limpio. (El cliente se construye con el placeholder de `.env.example`; no llama a la red al importar.)

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/config/server-config.ts src/server/ai/client.ts
git commit -m "feat: add @google/genai client + ServerConfig.gemini"
```

---

### Task 3: Servicio de embeddings (`embed.ts`)

**Files:**
- Create: `src/server/ai/embed.ts`
- Test: `src/server/ai/embed.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `src/server/ai/embed.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toEmbeddingVector } from "@/server/ai/embed";

describe("toEmbeddingVector", () => {
    it("returns the vector when it has 768 dimensions", () => {
        const v = Array.from({ length: 768 }, () => 0.1);
        expect(toEmbeddingVector(v)).toHaveLength(768);
    });

    it("throws when the vector is undefined", () => {
        expect(() => toEmbeddingVector(undefined)).toThrow(/768/);
    });

    it("throws when the vector has the wrong dimension", () => {
        expect(() => toEmbeddingVector([1, 2, 3])).toThrow(/768/);
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/server/ai/embed.test.ts`
Expected: FAIL — `toEmbeddingVector` no existe / módulo no encontrado.

- [ ] **Step 3: Implementar `src/server/ai/embed.ts`**

```ts
import { EMBEDDING_DIM, GEMINI_EMBED_MODEL, genai } from "./client";

export function toEmbeddingVector(values: number[] | undefined): number[] {
    if (!values || values.length !== EMBEDDING_DIM) {
        throw new Error(
            `Expected ${EMBEDDING_DIM}-dim embedding, got ${values?.length ?? 0}`,
        );
    }
    return values;
}

export async function embedText(text: string): Promise<number[]> {
    const res = await genai.models.embedContent({
        model: GEMINI_EMBED_MODEL,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIM },
    });
    return toEmbeddingVector(res.embeddings?.[0]?.values);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/server/ai/embed.test.ts`
Expected: PASS (3/3). (`embedText` no se ejercita aquí — llama a la red; se verifica a mano.)
> Si la forma de la respuesta del SDK difiere (p. ej. `res.embeddings[0].values` está tipado distinto en la versión instalada), ajusta a la API instalada y repórtalo. NO uses supresión de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/embed.ts src/server/ai/embed.test.ts
git commit -m "feat: gemini embedding service (768-dim) with dimension guard"
```

---

### Task 4: Servicio de extracción de perfil (`extract-profile.ts`)

**Files:**
- Create: `src/server/ai/extract-profile.ts`
- Test: `src/server/ai/extract-profile.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `src/server/ai/extract-profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseExtractedProfile } from "@/server/ai/extract-profile";

const VALID = JSON.stringify({
    escuela_profesional: "Ingeniería de Sistemas",
    grado: "egresado",
    ubicacion: "Arequipa",
    skills: ["TypeScript", "SQL"],
    experiencia_resumen: "2 años en backend.",
    intereses: ["Backend", "Data"],
});

describe("parseExtractedProfile", () => {
    it("parses a valid extraction JSON into a typed profile", () => {
        const p = parseExtractedProfile(VALID);
        expect(p.escuela_profesional).toBe("Ingeniería de Sistemas");
        expect(p.grado).toBe("egresado");
        expect(p.skills).toEqual(["TypeScript", "SQL"]);
    });

    it("throws when grado is not an allowed value", () => {
        const bad = JSON.stringify({
            escuela_profesional: "X",
            grado: "doctorado",
            ubicacion: "Y",
            skills: [],
            experiencia_resumen: "",
            intereses: [],
        });
        expect(() => parseExtractedProfile(bad)).toThrow();
    });

    it("throws when a required field is missing", () => {
        const bad = JSON.stringify({ grado: "egresado" });
        expect(() => parseExtractedProfile(bad)).toThrow();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/server/ai/extract-profile.test.ts`
Expected: FAIL — `parseExtractedProfile` no existe.

- [ ] **Step 3: Implementar `src/server/ai/extract-profile.ts`**

```ts
import { Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_FLASH_MODEL, genai } from "./client";

export const GRADOS = ["egresado", "bachiller", "titulado"] as const;

export const extractedProfileSchema = z.object({
    escuela_profesional: z.string(),
    grado: z.enum(GRADOS),
    ubicacion: z.string(),
    skills: z.array(z.string()),
    experiencia_resumen: z.string(),
    intereses: z.array(z.string()),
});

export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        escuela_profesional: { type: Type.STRING },
        grado: { type: Type.STRING, enum: [...GRADOS] },
        ubicacion: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        experiencia_resumen: { type: Type.STRING },
        intereses: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    propertyOrdering: [
        "escuela_profesional",
        "grado",
        "ubicacion",
        "skills",
        "experiencia_resumen",
        "intereses",
    ],
    required: [
        "escuela_profesional",
        "grado",
        "ubicacion",
        "skills",
        "experiencia_resumen",
        "intereses",
    ],
};

const PROMPT =
    "Extrae el perfil profesional del CV adjunto (PDF) y responde SOLO con JSON " +
    "según el schema. Para 'grado' infiere egresado, bachiller o titulado. " +
    "'intereses' son los roles o áreas objetivo del candidato. Si un dato no " +
    "aparece en el CV, usa cadena vacía o lista vacía.";

export function parseExtractedProfile(jsonText: string): ExtractedProfile {
    return extractedProfileSchema.parse(JSON.parse(jsonText));
}

export async function extractProfileFromPdf(
    pdfBytes: Uint8Array,
): Promise<ExtractedProfile> {
    const res = await genai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [
            {
                inlineData: {
                    data: Buffer.from(pdfBytes).toString("base64"),
                    mimeType: "application/pdf",
                },
            },
            { text: PROMPT },
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
        },
    });
    const text = res.text;
    if (!text) {
        throw new Error("Gemini returned an empty profile extraction");
    }
    return parseExtractedProfile(text);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/server/ai/extract-profile.test.ts`
Expected: PASS (3/3). (`extractProfileFromPdf` llama a la red; verificación manual con CV real.)
> Si `Type`, `responseSchema`, la forma de `contents` (array de `Part`) o `res.text` difieren en la versión instalada de `@google/genai`, ajusta a la API instalada y repórtalo. NO uses supresión de tipos. Si biome marca `Buffer` como global no importado, añade `import { Buffer } from "node:buffer";`.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/extract-profile.ts src/server/ai/extract-profile.test.ts
git commit -m "feat: gemini multimodal CV->profile extraction (structured output)"
```

---

### Task 5: Almacenamiento del CV + servicio de perfil

**Files:**
- Create: `src/server/services/cv-storage.ts`
- Create: `src/server/services/profile.ts`
- Test: `src/server/services/profile.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Ignorar `uploads/`**

Añade una línea `uploads/` a `.gitignore` (no commitear PDFs de usuarios).

- [ ] **Step 2: Crear `src/server/services/cv-storage.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CV_SUBDIR = path.join("uploads", "cv");

// Dev-only local disk storage. Production should swap to a blob store
// (Vercel serverless filesystem is ephemeral). Isolated here for that reason.
export async function saveCvPdf(
    userId: string,
    bytes: Uint8Array,
): Promise<string> {
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(process.cwd(), CV_SUBDIR);
    await mkdir(dir, { recursive: true });
    const relPath = path.join(CV_SUBDIR, `${safeId}.pdf`);
    await writeFile(path.join(process.cwd(), relPath), bytes);
    return relPath;
}
```

- [ ] **Step 3: Escribir el test que falla** — `src/server/services/profile.test.ts`

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import {
    buildProfileEmbeddingText,
    getProfile,
    upsertProfileFromCv,
} from "@/server/services/profile";

const TEST_USER_ID = "spec03-profile-test-user";

function fakeEmbedding(): number[] {
    return Array.from({ length: 768 }, () => 0.01);
}

describe("buildProfileEmbeddingText", () => {
    it("joins the relevant fields and skips empty ones", () => {
        const text = buildProfileEmbeddingText({
            escuelaProfesional: "Ing. Sistemas",
            skills: ["TS", "SQL"],
            experienciaResumen: "Backend 2 años",
            intereses: ["Data"],
        });
        expect(text).toContain("Ing. Sistemas");
        expect(text).toContain("TS, SQL");
        expect(text).toContain("Backend 2 años");
        expect(text).toContain("Data");
    });

    it("omits empty fields without leaving blank lines", () => {
        const text = buildProfileEmbeddingText({
            escuelaProfesional: "X",
            skills: [],
            experienciaResumen: null,
            intereses: null,
        });
        expect(text).toBe("X");
    });
});

describe("profile persistence", () => {
    afterAll(async () => {
        await db.delete(user).where(eq(user.id, TEST_USER_ID));
    });

    it("upserts the user's profile (insert then update, no duplicate)", async () => {
        await db.insert(user).values({
            id: TEST_USER_ID,
            name: "Profile Test",
            email: "spec03-profile-test@example.com",
            emailVerified: false,
        });

        const first = await upsertProfileFromCv({
            userId: TEST_USER_ID,
            cvUrl: "uploads/cv/first.pdf",
            extracted: {
                escuela_profesional: "Ing. Sistemas",
                grado: "egresado",
                ubicacion: "Arequipa",
                skills: ["TS"],
                experiencia_resumen: "v1",
                intereses: ["Backend"],
            },
            embedding: fakeEmbedding(),
        });
        expect(first.userId).toBe(TEST_USER_ID);
        expect(first.embedding).toHaveLength(768);

        const second = await upsertProfileFromCv({
            userId: TEST_USER_ID,
            cvUrl: "uploads/cv/second.pdf",
            extracted: {
                escuela_profesional: "Ing. Sistemas",
                grado: "egresado",
                ubicacion: "Lima",
                skills: ["TS", "SQL"],
                experiencia_resumen: "v2",
                intereses: ["Data"],
            },
            embedding: fakeEmbedding(),
        });
        expect(second.ubicacion).toBe("Lima");
        expect(second.experienciaResumen).toBe("v2");

        const rows = await db
            .select()
            .from(
                // count via select all then length — one row per user (PK userId)
                (await import("@/server/drizzle/schemas/profiles")).profiles,
            )
            .where(
                eq(
                    (await import("@/server/drizzle/schemas/profiles")).profiles
                        .userId,
                    TEST_USER_ID,
                ),
            );
        expect(rows).toHaveLength(1);

        const fetched = await getProfile(TEST_USER_ID);
        expect(fetched?.ubicacion).toBe("Lima");
    });
});
```
> NOTA: el `await import(...)` inline para contar filas es feo; cuando implementes, importa `profiles` arriba con los demás imports y úsalo directamente (`import { profiles } from "@/server/drizzle/schemas/profiles"`). Lo importante del test: una sola fila tras dos upserts, y los campos quedan en la versión más reciente.

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `pnpm test src/server/services/profile.test.ts`
Expected: FAIL — `src/server/services/profile.ts` no existe.

- [ ] **Step 5: Implementar `src/server/services/profile.ts`**

```ts
import { eq } from "drizzle-orm";
import { embedText } from "@/server/ai/embed";
import {
    type ExtractedProfile,
    extractProfileFromPdf,
} from "@/server/ai/extract-profile";
import { db } from "@/server/drizzle/db";
import { type Profile, profiles } from "@/server/drizzle/schemas/profiles";

export class ProfileNotFoundError extends Error {
    constructor() {
        super("Profile not found for user");
        this.name = "ProfileNotFoundError";
    }
}

export interface ProfilePatch {
    escuelaProfesional?: string;
    grado?: string;
    ubicacion?: string;
    intereses?: string[];
    skills?: string[];
    experienciaResumen?: string;
    expectativaSalarial?: number | null;
}

export function buildProfileEmbeddingText(input: {
    escuelaProfesional: string | null;
    skills: string[] | null;
    experienciaResumen: string | null;
    intereses: string[] | null;
}): string {
    return [
        input.escuelaProfesional ?? "",
        (input.skills ?? []).join(", "),
        input.experienciaResumen ?? "",
        (input.intereses ?? []).join(", "),
    ]
        .filter((segment) => segment.trim().length > 0)
        .join("\n");
}

export async function getProfile(userId: string): Promise<Profile | null> {
    const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
    return rows[0] ?? null;
}

export async function upsertProfileFromCv(params: {
    userId: string;
    cvUrl: string;
    extracted: ExtractedProfile;
    embedding: number[];
}): Promise<Profile> {
    const { userId, cvUrl, extracted, embedding } = params;
    const fields = {
        escuelaProfesional: extracted.escuela_profesional,
        grado: extracted.grado,
        ubicacion: extracted.ubicacion,
        skills: extracted.skills,
        experienciaResumen: extracted.experiencia_resumen,
        intereses: extracted.intereses,
        cvUrl,
        embedding,
    };
    const [row] = await db
        .insert(profiles)
        .values({ userId, ...fields })
        .onConflictDoUpdate({
            target: profiles.userId,
            set: { ...fields, updatedAt: new Date() },
        })
        .returning();
    return row;
}

export async function updateProfileFields(
    userId: string,
    patch: ProfilePatch,
    embedding: number[],
): Promise<Profile> {
    const [row] = await db
        .update(profiles)
        .set({ ...patch, embedding, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))
        .returning();
    return row;
}

// --- Orchestrators (call Gemini; verified manually) ---

export async function processCvAndSaveProfile(params: {
    userId: string;
    cvUrl: string;
    pdfBytes: Uint8Array;
}): Promise<Profile> {
    const extracted = await extractProfileFromPdf(params.pdfBytes);
    const embedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: extracted.escuela_profesional,
            skills: extracted.skills,
            experienciaResumen: extracted.experiencia_resumen,
            intereses: extracted.intereses,
        }),
    );
    return upsertProfileFromCv({
        userId: params.userId,
        cvUrl: params.cvUrl,
        extracted,
        embedding,
    });
}

export async function editProfile(
    userId: string,
    patch: ProfilePatch,
): Promise<Profile> {
    const current = await getProfile(userId);
    if (!current) {
        throw new ProfileNotFoundError();
    }
    const merged = { ...current, ...patch };
    const embedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: merged.escuelaProfesional,
            skills: merged.skills,
            experienciaResumen: merged.experienciaResumen,
            intereses: merged.intereses,
        }),
    );
    return updateProfileFields(userId, patch, embedding);
}
```
> Al implementar, mueve `import { profiles } from "@/server/drizzle/schemas/profiles"` arriba y arregla el test (Step 3) para usarlo en lugar del `await import` inline. No debe quedar supresión de tipos.

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `pnpm test src/server/services/profile.test.ts`
Expected: PASS (4/4). Una sola fila tras dos upserts; `getProfile` devuelve la versión más reciente. (Los orquestadores `processCvAndSaveProfile`/`editProfile` no se ejercitan aquí — llaman a Gemini.)

- [ ] **Step 7: Commit**

```bash
git add src/server/services/cv-storage.ts src/server/services/profile.ts src/server/services/profile.test.ts .gitignore
git commit -m "feat: CV storage + profile service (upsert/get/edit + embedding text)"
```

---

### Task 6: Router de perfil + montaje + gating de auth

**Files:**
- Create: `src/server/routers/profile.ts`
- Test: `src/server/routers/profile.test.ts`
- Modify: `src/server/router.ts`

- [ ] **Step 1: Escribir el test que falla** — `src/server/routers/profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/profile (auth gating)", () => {
    it("GET returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("PUT returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ubicacion: "Arequipa" }),
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("POST /cv returns 401 when unauthenticated (valid PDF supplied)", async () => {
        const form = new FormData();
        // minimal valid PDF header so t.File validation passes and the
        // handler runs far enough to hit the auth check
        const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
            type: "application/pdf",
        });
        form.append("file", pdf, "cv.pdf");
        const res = await app.handle(
            new Request("http://localhost/api/v1/profile/cv", {
                method: "POST",
                body: form,
            }),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
```
> Si Elysia `t.File` rechaza el blob mínimo por tamaño/tipo y devuelve 422 antes del handler, ajusta el blob para que pase la validación (el objetivo es llegar al chequeo de sesión → 401). Si la validación de `t.File` resulta no fiable en tests, repórtalo: como fallback, mueve el chequeo de sesión a un `derive`/guard que corra antes de la validación del body, y deja documentado el cambio. No suprimas tipos.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/server/routers/profile.test.ts`
Expected: FAIL — `profileRouter` no existe / rutas devuelven 404.

- [ ] **Step 3: Implementar `src/server/routers/profile.ts`**

```ts
import { Elysia, t } from "elysia";
import { auth } from "@/server/auth/auth";
import { saveCvPdf } from "@/server/services/cv-storage";
import {
    editProfile,
    getProfile,
    ProfileNotFoundError,
    processCvAndSaveProfile,
} from "@/server/services/profile";

export const profileRouter = new Elysia({ prefix: "/profile" })
    .post(
        "/cv",
        async ({ request, body, status }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            const bytes = new Uint8Array(await body.file.arrayBuffer());
            const cvUrl = await saveCvPdf(session.user.id, bytes);
            const profile = await processCvAndSaveProfile({
                userId: session.user.id,
                cvUrl,
                pdfBytes: bytes,
            });
            return { profile, extracted: true };
        },
        {
            body: t.Object({
                file: t.File({
                    type: "application/pdf",
                    maxSize: 10 * 1024 * 1024,
                }),
            }),
        },
    )
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const profile = await getProfile(session.user.id);
        return { profile };
    })
    .put(
        "/",
        async ({ request, body, status }) => {
            const session = await auth.api.getSession({
                headers: request.headers,
            });
            if (!session) {
                return status(401, { code: "unauthenticated" });
            }
            try {
                const profile = await editProfile(session.user.id, body);
                return { profile };
            } catch (e) {
                if (e instanceof ProfileNotFoundError) {
                    return status(404, { code: "profile_not_found" });
                }
                throw e;
            }
        },
        {
            body: t.Object({
                escuelaProfesional: t.Optional(t.String()),
                grado: t.Optional(t.String()),
                ubicacion: t.Optional(t.String()),
                intereses: t.Optional(t.Array(t.String())),
                skills: t.Optional(t.Array(t.String())),
                experienciaResumen: t.Optional(t.String()),
                expectativaSalarial: t.Optional(
                    t.Union([t.Integer(), t.Null()]),
                ),
            }),
        },
    );
```

- [ ] **Step 4: Montar el router en `src/server/router.ts`**

Importa y añade `.use(profileRouter)` junto a los demás:

```ts
import { profileRouter } from "@/server/routers/profile";
// ...
    .use(healthRouter)
    .use(meRouter)
    .use(gmailRouter)
    .use(profileRouter);
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm test src/server/routers/profile.test.ts`
Expected: PASS (3/3) — GET/PUT/POST sin sesión → 401 `{ code: "unauthenticated" }`.

- [ ] **Step 6: Suite completa + check + build**

Run: `pnpm test` → todos pasan (Spec 02 + los nuevos de Spec 03).
Run: `pnpm check` → limpio (biome + tsc).
Run: `pnpm build` → pasa. (Warning preexistente de Better Auth sobre google clientId vacío es esperado, no es regresión.)

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/profile.ts src/server/routers/profile.test.ts src/server/router.ts
git commit -m "feat: profile router (POST /cv, GET, PUT) mounted at /api/v1/profile"
```

---

## Verificación manual (post-implementación, requiere GEMINI_API_KEY real + CV real)

Estos pasos no se automatizan (igual que el OAuth de Spec 01):

1. `pnpm dev`.
2. Autenticarse con Google (Spec 01) para tener sesión.
3. `POST /api/v1/profile/cv` con un CV PDF real (multipart, campo `file`). Esperado: `{ profile, extracted: true }` con campos poblados (escuela, grado, ubicación, skills, experiencia, intereses) y `embedding` no nulo.
4. `GET /api/v1/profile` → devuelve el perfil.
5. `PUT /api/v1/profile` con correcciones (p. ej. `{ "ubicacion": "Lima", "expectativaSalarial": 3000 }`) → persiste y recomputa el embedding.
6. Confirmar en la DB que `profiles.embedding` tiene 768 dims y hay **una sola fila** por usuario tras re-subir el CV:
   ```bash
   pnpm dlx tsx --env-file=.env.local -e "import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL); const r=await sql\`select user_id, vector_dims(embedding) as dims, expectativa_salarial from profiles\`; console.log(r); await sql.end();"
   ```
   (Si el inline `-e` falla por top-level await, usa un `.mts` temporal como en Task 1 Step 4.)

---

## Self-Review

**Spec coverage (spec-03 → task):**
- Endpoint subida de CV (PDF) + almacenamiento + `cv_url` → Task 5 (cv-storage) + Task 6 (POST /cv) ✅
- Validar tipo/size (PDF ≤ ~10MB) → Task 6 (`t.File({ type, maxSize })`) ✅
- Extracción con Gemini multimodal (PDF directo, sin lib de parseo, responseSchema JSON) → Task 4 ✅
- `raw_cv_text` opcional para depurar → columna existe (Spec 02); no se puebla en MVP (opcional por spec) — nota ✅
- Persistencia + edición (GET/PUT, correcciones + expectativa_salarial) → Task 5 (servicio) + Task 6 (GET/PUT) ✅
- Generación del embedding del perfil (texto compuesto, 768) → Task 3 + Task 5 (`buildProfileEmbeddingText` + `embedText`) ✅
- Recalcular embedding al editar → Task 5 (`editProfile`) ✅
- Reintentar subida actualiza (no duplica) → Task 5 (`upsertProfileFromCv` onConflictDoUpdate sobre PK `userId`) + test ✅
- Aislamiento por `user_id`; no exponer archivos de otros → toda query filtra por `session.user.id`; storage por `userId` ✅
- No loguear contenido del CV → ningún `logger`/`console` toca bytes ni campos del perfil ✅
- Criterio "embedding 768 dims" → Task 3 guard + verificación manual `vector_dims` ✅

**Placeholder scan:** sin TBD/TODO. Todo paso tiene código/comandos completos. (Las dos `> NOTA` de limpieza —mover el import de `profiles`, y ajustar el blob de `t.File`— son instrucciones explícitas de implementación, no placeholders.)

**Type consistency:** `ExtractedProfile` (campos snake_case del modelo) se mapea a columnas camelCase en `upsertProfileFromCv`. `buildProfileEmbeddingText` recibe campos camelCase nullables (forma de `Profile`) y se llama igual desde extracción (mapeando snake→camel) y desde edición (desde la fila). `EMBEDDING_DIM`/modelos centralizados en `client.ts` y reusados. `profiles` debe importarse al tope en `profile.ts` y en su test (no `await import`). `Profile` incluye `skills`/`experienciaResumen` tras Task 1.

**Risk flags (verificar contra versión instalada; sin supresión):** API de `@google/genai` (`Type`, `responseSchema`, `contents` como `Part[]`, `res.text`, `res.embeddings[0].values`) — Task 4/3; `t.File` validación multipart en Elysia y su orden vs. el chequeo de sesión — Task 6 (fallback: guard antes de validación, documentado); `Buffer` global vs `node:buffer` import — Task 4.

**Out of scope (later specs):** matching/retrieval con el embedding (Spec 05); UI de subida/edición (Spec 06); versiones/multi-CV, blob store de producción (YAGNI).
