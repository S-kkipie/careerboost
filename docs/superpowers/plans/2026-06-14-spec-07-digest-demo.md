# Spec 07 — Digest & Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the anti-saturation loop — a periodic digest (in-app + optional 1 email) of new top matches, driven by a secured cron that reuses ingestion + matching, plus a deterministic demo seed and a 3-minute demo script.

**Architecture:** A Vercel Cron hits a dedicated Next route handler `GET /api/cron/digest`, authorized by `Bearer ${CRON_SECRET}`. For each Gmail-connected user it refreshes a Google access token directly (no session in cron), runs ingestion (Spec 04) then matching (Spec 05), selects the user's `status="new"` top matches, and — if `RESEND_API_KEY` is set — emails them. The same selection backs an in-app "Tu digest" page served by a session-scoped Elysia router `/api/v1/digest`. No new tables and no migration: the digest is just `matches` rows whose `status` is still `"new"`.

**Tech Stack:** Next.js 16 (App Router) · Elysia (`/api/v1`) · Eden Treaty + eden-tanstack-react-query · Drizzle/Postgres · Google OAuth token refresh (raw fetch) · Resend (raw fetch) · Vitest (node, pure-logic only).

---

## Decisions (read before starting)

1. **No new endpoints table / no migration.** The digest is the set of `matches` rows with `status="new"` and `rerank_score >= RERANK_THRESHOLD`, top-K. Reuses Spec 02 tables. `matches.status` already defaults to `"new"` (see `src/server/drizzle/schemas/matches.ts:29`).
2. **Cron token via direct Google refresh.** `getGoogleAccessToken` (Spec 01) requires session headers, which a cron does not have. The cron refreshes each user's token directly against `https://oauth2.googleapis.com/token` using the stored `account.refresh_token` + `GOOGLE_CLIENT_ID/SECRET`. New module `google-oauth.ts`.
3. **Cron route is a dedicated Next.js handler**, `src/app/api/cron/digest/route.ts`, OUTSIDE Elysia / `/api/v1` (no session, no eden). A concrete route segment wins over the optional catch-all `src/app/api/[[...slugs]]/route.ts`. Runs on the default Node runtime (Drizzle needs it).
4. **In-app digest via Elysia** `/api/v1/digest`: session-scoped `GET /` (new top matches) + `POST /seen` (mark all `new`→`seen` for the user). Returns the existing `FeedItem` shape so `MatchCard` renders unchanged.
5. **Email via raw fetch to Resend** — no new dependency. Degrades to in-app only when `RESEND_API_KEY` is absent. `from` from `RESEND_FROM` env (default `"CareerBoost <onboarding@resend.dev>"`, which Resend allows without domain verification for testing).
6. **"Seen" semantics.** The in-app digest is the source of truth for "seen": opening `/digest` and pressing "Marcar como visto" flips `new`→`seen`. The cron email does NOT mark seen (cross-day email de-dup is out of scope per spec — YAGNI; acceptable for a daily demo).
7. **Digest size:** `DIGEST_LIMIT = 5`. **Cron schedule:** daily `0 13 * * *` (13:00 UTC ≈ 08:00 Peru).
8. **Security constraints (MUST hold — enforced by review):**
   - Never log OAuth tokens (access or refresh), CV content, raw email bodies, or email HTML.
   - Per-user isolation: `/digest` GET and `/seen` use `session.user.id` only — never a client-supplied id. The cron iterates all users intentionally, but every downstream op (`runIngestion`, `runMatching`, `getDigest`, `markDigestSeen`) is scoped by `userId`.
   - `CRON_SECRET` compared in constant time. Reject missing/wrong with 401.
   - Gmail stays read-only (we only refresh the existing `gmail.readonly` grant; no scope change).
   - Secrets only from env via `ServerConfig`; `.env.local` stays gitignored.
9. **No type suppression.** No `any` / `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`. Use `in` + `typeof` narrowing (as `format.ts` `errorCode` does). `sql<T>`, `keyof`, normal generics are allowed.
10. **No DOM test runner** (Vitest env=node, no jsdom). Unit-test pure logic only: `cron-auth.ts`, `google-oauth.ts`, `digest-email.ts`. DB queries + orchestrators (`getDigest`, `markDigestSeen`, `listDigestUsers`, `runDigest`) and React components are verified via `pnpm check` + `pnpm build` + manual walk — same convention as Specs 04/05/06.
11. **Demo is bulletproof offline.** `scripts/seed-demo.ts` seeds a curated profile + jobs (with real embeddings) + an `ingestion_runs` row + runs matching for a user resolved by email — no Gmail needed. The Gmail-test-account path is documented as the authentic alternative.

## File Structure

**New files**
- `src/server/services/cron-auth.ts` — constant-time cron authorization (pure). Test: `cron-auth.test.ts`.
- `src/server/services/google-oauth.ts` — Google refresh-token exchange (pure builders + parse, + fetch wrapper). Test: `google-oauth.test.ts`.
- `src/server/services/digest.ts` — digest selection (`getDigest`, `markDigestSeen`), eligible-user query (`listDigestUsers`), and the `runDigest` orchestrator.
- `src/server/services/digest-email.ts` — `buildDigestEmail` (pure) + `sendDigestEmail` (fetch). Test: `digest-email.test.ts`.
- `src/server/routers/digest.ts` — Elysia session-scoped digest router.
- `src/app/api/cron/digest/route.ts` — Next.js cron handler.
- `src/app/(app)/digest/page.tsx` — "Tu digest" page.
- `scripts/seed-demo.ts` — deterministic demo seeder.
- `vercel.json` — cron schedule.
- `docs/demo/guion.md` — 3-minute demo script + setup (both paths) + sample emails.

**Modified files**
- `src/config/env.ts` — add `RESEND_FROM` (optional).
- `.env.example` — add `RESEND_FROM`.
- `src/config/server-config.ts` — expose `cron.secret`, `resend.{apiKey,from}`.
- `src/server/services/matching.ts` — extract `FeedRow` type + `mapFeedRow` (DRY: shared by `getFeed` and `getDigest`).
- `src/server/router.ts` — mount `digestRouter`.
- `src/frontend/hooks/api.ts` — `useDigest`, `useMarkDigestSeen`; extend `useSetMatchStatus` to also invalidate the digest query.
- `src/frontend/components/app-nav.tsx` — add "Digest" nav link.
- `package.json` — add `db:seed-demo` script.

---

### Task 1: Config — expose CRON / Resend settings

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `src/config/server-config.ts`

`CRON_SECRET` (required, min 16) and `RESEND_API_KEY` (optional) already exist in `env.ts`. This task only adds `RESEND_FROM` and surfaces all three in `ServerConfig`.

- [ ] **Step 1: Add `RESEND_FROM` to the env schema**

In `src/config/env.ts`, inside `server: { ... }`, after the `RESEND_API_KEY` line add:

```ts
        RESEND_API_KEY: z.string().optional(),
        RESEND_FROM: z.string().optional(),
```

And inside `runtimeEnv: { ... }`, after the `RESEND_API_KEY` line add:

```ts
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        RESEND_FROM: process.env.RESEND_FROM,
```

- [ ] **Step 2: Add `RESEND_FROM` to `.env.example`**

In `.env.example`, after the `RESEND_API_KEY=""` line add:

```
RESEND_API_KEY=""
RESEND_FROM=""
```

- [ ] **Step 3: Surface settings in `ServerConfig`**

Replace the contents of `src/config/server-config.ts` with:

```ts
import { env } from "./env";

const DEFAULT_RESEND_FROM = "CareerBoost <onboarding@resend.dev>";

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
    cron: {
        secret: env.CRON_SECRET,
    },
    resend: {
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM ?? DEFAULT_RESEND_FROM,
    },
} as const;
```

- [ ] **Step 4: Verify type-check passes**

Run: `pnpm check`
Expected: exit 0 (Biome + `tsc --noEmit` clean).

- [ ] **Step 5: Verify the existing suite still passes**

Run: `pnpm test`
Expected: all existing tests pass (107 at branch start).

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts .env.example src/config/server-config.ts
git commit -m "feat(spec-07): expose cron + resend settings in ServerConfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Cron authorization (pure, TDD)

**Files:**
- Create: `src/server/services/cron-auth.ts`
- Test: `src/server/services/cron-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/services/cron-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { constantTimeEqual, isAuthorizedCron } from "@/server/services/cron-auth";

describe("constantTimeEqual", () => {
    it("returns true for identical strings", () => {
        expect(constantTimeEqual("abcdef123456", "abcdef123456")).toBe(true);
    });

    it("returns false for different strings of equal length", () => {
        expect(constantTimeEqual("abcdef123456", "abcdef123457")).toBe(false);
    });

    it("returns false for different lengths", () => {
        expect(constantTimeEqual("short", "longer-value")).toBe(false);
    });
});

describe("isAuthorizedCron", () => {
    const secret = "super-secret-cron-value";

    it("accepts a correct Bearer header", () => {
        expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    });

    it("rejects a wrong secret", () => {
        expect(isAuthorizedCron("Bearer wrong-value-here-xx", secret)).toBe(
            false,
        );
    });

    it("rejects a missing header", () => {
        expect(isAuthorizedCron(null, secret)).toBe(false);
    });

    it("rejects the bare secret without the Bearer prefix", () => {
        expect(isAuthorizedCron(secret, secret)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/services/cron-auth.test.ts`
Expected: FAIL (cannot find module `cron-auth`).

- [ ] **Step 3: Write the implementation**

Create `src/server/services/cron-auth.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

// Length-checked constant-time string comparison. timingSafeEqual throws on
// unequal buffer lengths, so guard length first (and return false — a length
// mismatch is already a non-match).
export function constantTimeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
        return false;
    }
    return timingSafeEqual(ab, bb);
}

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set. Accept only an exact "Bearer <secret>" match.
export function isAuthorizedCron(
    authHeader: string | null,
    secret: string,
): boolean {
    if (!authHeader) {
        return false;
    }
    return constantTimeEqual(authHeader, `Bearer ${secret}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/services/cron-auth.test.ts`
Expected: PASS (7 assertions across 4 `it` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/cron-auth.ts src/server/services/cron-auth.test.ts
git commit -m "feat(spec-07): constant-time cron authorization helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Google token refresh (pure builders TDD + fetch wrapper)

**Files:**
- Create: `src/server/services/google-oauth.ts`
- Test: `src/server/services/google-oauth.test.ts`

This module is DB-free and ServerConfig-free (callers pass credentials in), so the test loads no database.

- [ ] **Step 1: Write the failing test**

Create `src/server/services/google-oauth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    buildTokenRefreshBody,
    parseTokenRefreshResponse,
} from "@/server/services/google-oauth";

describe("buildTokenRefreshBody", () => {
    it("encodes the four required refresh-token params", () => {
        const body = buildTokenRefreshBody({
            clientId: "cid",
            clientSecret: "csecret",
            refreshToken: "rtoken",
        });
        expect(body.get("client_id")).toBe("cid");
        expect(body.get("client_secret")).toBe("csecret");
        expect(body.get("refresh_token")).toBe("rtoken");
        expect(body.get("grant_type")).toBe("refresh_token");
    });
});

describe("parseTokenRefreshResponse", () => {
    it("extracts access token, expiry and scope", () => {
        const out = parseTokenRefreshResponse({
            access_token: "ya29.token",
            expires_in: 3599,
            scope: "https://www.googleapis.com/auth/gmail.readonly",
        });
        expect(out.accessToken).toBe("ya29.token");
        expect(out.expiresInSec).toBe(3599);
        expect(out.scope).toBe(
            "https://www.googleapis.com/auth/gmail.readonly",
        );
    });

    it("defaults expiry to 0 and scope to null when absent", () => {
        const out = parseTokenRefreshResponse({ access_token: "ya29.token" });
        expect(out.expiresInSec).toBe(0);
        expect(out.scope).toBeNull();
    });

    it("throws when access_token is missing", () => {
        expect(() => parseTokenRefreshResponse({ expires_in: 10 })).toThrow();
    });

    it("throws when the payload is not an object", () => {
        expect(() => parseTokenRefreshResponse("nope")).toThrow();
        expect(() => parseTokenRefreshResponse(null)).toThrow();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/services/google-oauth.test.ts`
Expected: FAIL (cannot find module `google-oauth`).

- [ ] **Step 3: Write the implementation**

Create `src/server/services/google-oauth.ts`:

```ts
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokenRefresh {
    accessToken: string;
    expiresInSec: number;
    scope: string | null;
}

export function buildTokenRefreshBody(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): URLSearchParams {
    return new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        refresh_token: params.refreshToken,
        grant_type: "refresh_token",
    });
}

// Narrow with `in` + `typeof` (no casts) so the response shape is validated
// at runtime. Never include the parsed token in thrown messages.
export function parseTokenRefreshResponse(json: unknown): GoogleTokenRefresh {
    if (typeof json !== "object" || json === null) {
        throw new Error("Google token refresh: response was not an object");
    }
    const accessToken =
        "access_token" in json && typeof json.access_token === "string"
            ? json.access_token
            : null;
    if (!accessToken) {
        throw new Error("Google token refresh: missing access_token");
    }
    const expiresInSec =
        "expires_in" in json && typeof json.expires_in === "number"
            ? json.expires_in
            : 0;
    const scope =
        "scope" in json && typeof json.scope === "string" ? json.scope : null;
    return { accessToken, expiresInSec, scope };
}

// Exchange a stored refresh token for a fresh access token. Throws on HTTP
// failure. Never logs the token or the response body.
export async function refreshGoogleAccessToken(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): Promise<GoogleTokenRefresh> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildTokenRefreshBody(params),
    });
    if (!res.ok) {
        throw new Error(`Google token refresh failed: ${res.status}`);
    }
    return parseTokenRefreshResponse(await res.json());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/services/google-oauth.test.ts`
Expected: PASS (4 `it` blocks).

- [ ] **Step 5: Verify type-check**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/google-oauth.ts src/server/services/google-oauth.test.ts
git commit -m "feat(spec-07): Google refresh-token exchange for cron token access

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Digest selection + eligible users (+ shared feed mapper)

**Files:**
- Modify: `src/server/services/matching.ts` (extract `FeedRow` + `mapFeedRow`)
- Create: `src/server/services/digest.ts` (selection + users only; `runDigest` added in Task 6)

DRY: `getFeed` (Spec 05) and the new `getDigest` map identical row shapes to `FeedItem`. Extract the mapping once.

- [ ] **Step 1: Add `FeedRow` + `mapFeedRow` to `matching.ts`**

In `src/server/services/matching.ts`, immediately AFTER the `FeedItem` interface (ends at line ~209, just before the `getFeed` comment), insert:

```ts
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
        },
        status: r.status,
    };
}
```

- [ ] **Step 2: Make `getFeed` use the shared mapper**

In `src/server/services/matching.ts`, the `getFeed` function ends with `return rows.map((r) => ({ ... }));` (lines ~254-271). Replace that entire `return rows.map((r) => ({ ... }));` block with:

```ts
    return rows.map(mapFeedRow);
```

(The `select(...)` in `getFeed` already produces exactly the `FeedRow` field set, so the types line up.)

- [ ] **Step 3: Verify the existing suite still passes**

Run: `pnpm check && pnpm test`
Expected: exit 0; all existing tests pass (the refactor is behavior-preserving).

- [ ] **Step 4: Create the digest selection module**

Create `src/server/services/digest.ts`:

```ts
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/server/drizzle/db";
import { account, user } from "@/server/drizzle/schemas/auth-schema";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { matches } from "@/server/drizzle/schemas/matches";
import { GMAIL_READONLY_SCOPE } from "@/server/services/gmail";
import {
    type FeedItem,
    mapFeedRow,
    RERANK_THRESHOLD,
} from "@/server/services/matching";

export const DIGEST_LIMIT = 5;

export interface DigestUser {
    userId: string;
    email: string;
    refreshToken: string;
}

// Users with a Google account that (a) still has a refresh token and (b)
// granted gmail.readonly. Drizzle does not narrow nullable columns through a
// WHERE, so the JS guard re-checks refreshToken before pushing.
export async function listDigestUsers(): Promise<DigestUser[]> {
    const rows = await db
        .select({
            userId: account.userId,
            email: user.email,
            refreshToken: account.refreshToken,
            scope: account.scope,
        })
        .from(account)
        .innerJoin(user, eq(account.userId, user.id))
        .where(
            and(
                eq(account.providerId, "google"),
                isNotNull(account.refreshToken),
            ),
        );

    const out: DigestUser[] = [];
    for (const r of rows) {
        if (r.refreshToken && r.scope?.includes(GMAIL_READONLY_SCOPE)) {
            out.push({
                userId: r.userId,
                email: r.email,
                refreshToken: r.refreshToken,
            });
        }
    }
    return out;
}

// The digest = the user's still-"new", above-threshold matches, top-K by
// rerank score. Per-user isolation via the user_id predicate.
export async function getDigest(
    userId: string,
    limit: number = DIGEST_LIMIT,
): Promise<FeedItem[]> {
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
        .where(
            and(
                eq(matches.userId, userId),
                eq(matches.status, "new"),
                gte(matches.rerankScore, RERANK_THRESHOLD),
            ),
        )
        .orderBy(desc(matches.rerankScore))
        .limit(limit);

    return rows.map(mapFeedRow);
}

// Mark every still-"new" match for the user as "seen". Scoped by user_id so a
// user cannot touch another user's matches. Returns how many were updated.
export async function markDigestSeen(userId: string): Promise<number> {
    const updated = await db
        .update(matches)
        .set({ status: "seen" })
        .where(and(eq(matches.userId, userId), eq(matches.status, "new")))
        .returning({ id: matches.id });
    return updated.length;
}
```

- [ ] **Step 5: Verify type-check**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/matching.ts src/server/services/digest.ts
git commit -m "feat(spec-07): digest selection, eligible-user query, shared feed mapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Digest email (pure builder TDD + Resend sender)

**Files:**
- Create: `src/server/services/digest-email.ts`
- Test: `src/server/services/digest-email.test.ts`

`digest-email.ts` imports only `type { FeedItem }` (erased at runtime) so the test pulls in no DB. Salary formatting is inlined here to keep the module dependency-free.

- [ ] **Step 1: Write the failing test**

Create `src/server/services/digest-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/server/services/matching";
import { buildDigestEmail, escapeHtml } from "@/server/services/digest-email";

function makeItem(over: Partial<FeedItem["job"]> = {}): FeedItem {
    return {
        id: "m1",
        rerank_score: 82,
        explanation: "Encaja con tu perfil.",
        job: {
            titulo: "Backend Developer",
            empresa: "Acme",
            modalidad: "remoto",
            ubicacion: "Arequipa",
            salario_min: 3000,
            salario_max: 4000,
            moneda: "PEN",
            salario_periodo: "mes",
            salario_explicito: true,
            apply_link: "https://jobs.example/123",
            ...over,
        },
        status: "new",
    };
}

describe("escapeHtml", () => {
    it("escapes the five HTML-sensitive characters", () => {
        expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
            "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;",
        );
    });
});

describe("buildDigestEmail", () => {
    const base = {
        to: "egresado@unsa.edu.pe",
        from: "CareerBoost <onboarding@resend.dev>",
        appUrl: "https://app.example",
    };

    it("uses a singular subject for one item", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.subject).toBe("Tu digest CareerBoost: 1 nueva oportunidad");
    });

    it("uses a plural subject for several items", () => {
        const out = buildDigestEmail({
            ...base,
            items: [makeItem(), makeItem({ titulo: "Data Analyst" })],
        });
        expect(out.subject).toBe(
            "Tu digest CareerBoost: 2 nuevas oportunidades",
        );
    });

    it("includes the job title and apply link in the HTML", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.html).toContain("Backend Developer");
        expect(out.html).toContain("https://jobs.example/123");
    });

    it("falls back to the feed URL when a job has no apply link", () => {
        const out = buildDigestEmail({
            ...base,
            items: [makeItem({ apply_link: null })],
        });
        expect(out.html).toContain("https://app.example/feed");
    });

    it("puts the key anti-saturation message in the text body", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.text).toContain("100 correos");
        expect(out.text).toContain("https://app.example/digest");
    });

    it("carries from/to through to the payload", () => {
        const out = buildDigestEmail({ ...base, items: [makeItem()] });
        expect(out.from).toBe(base.from);
        expect(out.to).toBe(base.to);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/services/digest-email.test.ts`
Expected: FAIL (cannot find module `digest-email`).

- [ ] **Step 3: Write the implementation**

Create `src/server/services/digest-email.ts`:

```ts
import type { FeedItem } from "@/server/services/matching";

const RESEND_API_URL = "https://api.resend.com/emails";
const KEY_MESSAGE =
    "Más de 100 correos al mes, ahora en un solo resumen. Esto es lo nuevo para ti:";

export interface DigestEmailPayload {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function salaryLine(job: FeedItem["job"]): string {
    if (!job.salario_explicito || job.salario_min == null) {
        return "Salario no especificado";
    }
    const amount =
        job.salario_max != null && job.salario_max !== job.salario_min
            ? `${job.salario_min}-${job.salario_max}`
            : `${job.salario_min}`;
    return [job.moneda ?? "", amount, job.salario_periodo ?? ""]
        .filter((segment) => segment.length > 0)
        .join(" ");
}

// Build a minimal HTML + text digest email. Pure: no network, no logging.
export function buildDigestEmail(params: {
    to: string;
    from: string;
    items: FeedItem[];
    appUrl: string;
}): DigestEmailPayload {
    const { to, from, items, appUrl } = params;
    const count = items.length;
    const noun = count === 1 ? "nueva oportunidad" : "nuevas oportunidades";
    const subject = `Tu digest CareerBoost: ${count} ${noun}`;
    const digestUrl = `${appUrl}/digest`;

    const cards = items
        .map((item) => {
            const titulo = escapeHtml(item.job.titulo ?? "Oportunidad");
            const empresa = item.job.empresa
                ? `${escapeHtml(item.job.empresa)}<br/>`
                : "";
            const salary = escapeHtml(salaryLine(item.job));
            const link = escapeHtml(item.job.apply_link ?? `${appUrl}/feed`);
            const pct =
                item.rerank_score == null
                    ? ""
                    : ` · ${Math.round(item.rerank_score)}% match`;
            return [
                `<li style="margin-bottom:16px">`,
                `<strong>${titulo}</strong>${pct}<br/>`,
                empresa,
                `${salary}<br/>`,
                `<a href="${link}">Postular</a>`,
                `</li>`,
            ].join("");
        })
        .join("");

    const html = [
        `<h2>${escapeHtml(subject)}</h2>`,
        `<p>${escapeHtml(KEY_MESSAGE)}</p>`,
        `<ul>${cards}</ul>`,
        `<p><a href="${escapeHtml(digestUrl)}">Ver tu digest completo</a></p>`,
    ].join("");

    const textLines = items.map((item) => {
        const titulo = item.job.titulo ?? "Oportunidad";
        const empresa = item.job.empresa ? ` — ${item.job.empresa}` : "";
        const link = item.job.apply_link ?? `${appUrl}/feed`;
        return `• ${titulo}${empresa}\n  ${salaryLine(item.job)}\n  ${link}`;
    });
    const text = [KEY_MESSAGE, "", ...textLines, "", digestUrl].join("\n");

    return { from, to, subject, html, text };
}

// Send via Resend's HTTP API. Throws on failure. Never logs the API key or
// the email body.
export async function sendDigestEmail(
    payload: DigestEmailPayload,
    apiKey: string,
): Promise<void> {
    const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
        }),
    });
    if (!res.ok) {
        throw new Error(`Resend send failed: ${res.status}`);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/services/digest-email.test.ts`
Expected: PASS (7 `it` blocks).

- [ ] **Step 5: Verify type-check**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/digest-email.ts src/server/services/digest-email.test.ts
git commit -m "feat(spec-07): digest email builder + Resend sender

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `runDigest` orchestrator

**Files:**
- Modify: `src/server/services/digest.ts`

Reuses ingestion (Spec 04) + matching (Spec 05). Per-user `try/catch` so one failure never aborts the run. Verified manually (calls Google + Gemini + Resend), like the other orchestrators.

- [ ] **Step 1: Add imports + the orchestrator to `digest.ts`**

At the TOP of `src/server/services/digest.ts`, add these imports (keep the existing ones):

```ts
import { getLogger } from "@logtape/logtape";
import { ServerConfig } from "@/config/server-config";
import { runIngestion } from "@/server/services/ingestion";
import {
    ProfileNotReadyError,
    runMatching,
} from "@/server/services/matching";
import {
    buildDigestEmail,
    sendDigestEmail,
} from "@/server/services/digest-email";
import { refreshGoogleAccessToken } from "@/server/services/google-oauth";
```

> Note: the existing `import { type FeedItem, mapFeedRow, RERANK_THRESHOLD } from "@/server/services/matching";` (from Task 4) stays. Merge the new `ProfileNotReadyError, runMatching` names into that same import line if you prefer a single import statement — either form is fine as long as `tsc` is happy.

At the BOTTOM of `src/server/services/digest.ts`, append:

```ts
const logger = getLogger(["server", "digest"]);

export interface DigestRunResult {
    usersProcessed: number;
    usersWithNewMatches: number;
    emailsSent: number;
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// Cron orchestrator: for each eligible user, refresh the Google token, run
// ingestion + matching, then surface (and optionally email) the new digest.
// Per-user failures are logged and skipped. Never logs tokens or email bodies.
export async function runDigest(): Promise<DigestRunResult> {
    const users = await listDigestUsers();
    const result: DigestRunResult = {
        usersProcessed: 0,
        usersWithNewMatches: 0,
        emailsSent: 0,
    };
    const resendKey = ServerConfig.resend.apiKey;

    for (const u of users) {
        try {
            result.usersProcessed++;

            const { accessToken } = await refreshGoogleAccessToken({
                clientId: ServerConfig.google.clientId,
                clientSecret: ServerConfig.google.clientSecret,
                refreshToken: u.refreshToken,
            });

            await runIngestion({ userId: u.userId, accessToken });

            try {
                await runMatching({ userId: u.userId });
            } catch (e) {
                if (!(e instanceof ProfileNotReadyError)) {
                    throw e;
                }
                // No profile yet — nothing to match; still allow other users.
            }

            const digest = await getDigest(u.userId);
            if (digest.length === 0) {
                continue;
            }
            result.usersWithNewMatches++;

            if (resendKey) {
                const payload = buildDigestEmail({
                    to: u.email,
                    from: ServerConfig.resend.from,
                    items: digest,
                    appUrl: ServerConfig.baseUrl,
                });
                await sendDigestEmail(payload, resendKey);
                result.emailsSent++;
            }
        } catch (err) {
            logger.warn("digest user {userId} failed: {error}", {
                userId: u.userId,
                error: errMessage(err),
            });
        }
    }

    return result;
}
```

- [ ] **Step 2: Verify type-check + suite**

Run: `pnpm check && pnpm test`
Expected: exit 0; all tests pass (no new tests — orchestrator is manual-only).

- [ ] **Step 3: Commit**

```bash
git add src/server/services/digest.ts
git commit -m "feat(spec-07): runDigest cron orchestrator (ingest + match + email)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Cron route handler

**Files:**
- Create: `src/app/api/cron/digest/route.ts`

A concrete route segment that takes priority over the optional catch-all. Node runtime (default). 401 on bad/missing secret.

- [ ] **Step 1: Write the route handler**

Create `src/app/api/cron/digest/route.ts`:

```ts
// Default Node.js runtime — required for Drizzle (postgres driver). Do not set
// runtime = "edge". force-dynamic so the cron is never statically cached.
import { ServerConfig } from "@/config/server-config";
import { isAuthorizedCron } from "@/server/services/cron-auth";
import { runDigest } from "@/server/services/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
    if (
        !isAuthorizedCron(
            request.headers.get("authorization"),
            ServerConfig.cron.secret,
        )
    ) {
        return Response.json({ code: "unauthorized" }, { status: 401 });
    }
    const result = await runDigest();
    return Response.json({ ok: true, ...result });
}
```

- [ ] **Step 2: Verify type-check + build**

Run: `pnpm check && pnpm build`
Expected: exit 0; build output lists the route `/api/cron/digest` (under ƒ / dynamic).

- [ ] **Step 3: Manual smoke (local) — unauthorized rejected**

Start the dev server in another terminal (`pnpm dev`), then:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/digest`
Expected: `401`

- [ ] **Step 4: Manual smoke (local) — authorized runs**

Run (replace with the CRON_SECRET from `.env.local`):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
```

Expected: JSON like `{"ok":true,"usersProcessed":N,"usersWithNewMatches":M,"emailsSent":K}` with no 500. (With no Gmail-connected users, `usersProcessed` is 0 — still `ok:true`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/digest/route.ts
git commit -m "feat(spec-07): secured GET /api/cron/digest route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Elysia digest router (in-app)

**Files:**
- Create: `src/server/routers/digest.ts`
- Modify: `src/server/router.ts`

- [ ] **Step 1: Write the router**

Create `src/server/routers/digest.ts`:

```ts
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { getDigest, markDigestSeen } from "@/server/services/digest";

export const digestRouter = new Elysia({ prefix: "/digest" })
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const matches = await getDigest(session.user.id);
        return { matches };
    })
    .post("/seen", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const count = await markDigestSeen(session.user.id);
        return { count };
    });
```

- [ ] **Step 2: Mount the router**

In `src/server/router.ts`, add the import alongside the other router imports:

```ts
import { digestRouter } from "@/server/routers/digest";
```

And add `.use(digestRouter)` to the chain, after `.use(matchRouter)`:

```ts
    .use(ingestRouter)
    .use(matchRouter)
    .use(digestRouter);
```

- [ ] **Step 3: Verify type-check + build**

Run: `pnpm check && pnpm build`
Expected: exit 0. (Building regenerates the `AppRouter` type that eden consumes in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/digest.ts src/server/router.ts
git commit -m "feat(spec-07): session-scoped /api/v1/digest router (get + seen)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Frontend digest hooks

**Files:**
- Modify: `src/frontend/hooks/api.ts`

Adds `useDigest` + `useMarkDigestSeen`, and extends `useSetMatchStatus` so save/dismiss from the digest page also refreshes the digest list.

- [ ] **Step 1: Add the digest query hook**

In `src/frontend/hooks/api.ts`, in the `// --- Queries ---` section, after `useFeed`, add:

```ts
export function useDigest() {
    const api = useElysia();
    return useQuery(api.digest.get.queryOptions());
}
```

- [ ] **Step 2: Add the mark-seen mutation**

In the `// --- Mutations ---` section, after `useSetMatchStatus` (end of file), add:

```ts
export function useMarkDigestSeen() {
    const api = useElysia();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.digest.seen.post();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.digest.get.queryKey() });
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
        },
    });
}
```

- [ ] **Step 3: Extend `useSetMatchStatus` to also invalidate the digest**

In `useSetMatchStatus`, replace its `onSuccess` block:

```ts
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
        },
```

with:

```ts
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: api.match.get.queryKey() });
            qc.invalidateQueries({ queryKey: api.digest.get.queryKey() });
        },
```

- [ ] **Step 4: Verify type-check**

Run: `pnpm check`
Expected: exit 0. (If `api.digest` is not found, the Task 8 build did not run — run `pnpm build` once to refresh the `AppRouter` type, then re-check.)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/hooks/api.ts
git commit -m "feat(spec-07): useDigest + useMarkDigestSeen hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Digest page + nav link

**Files:**
- Create: `src/app/(app)/digest/page.tsx`
- Modify: `src/frontend/components/app-nav.tsx`

Reuses `MatchCard` and `Skeleton`. Inside the `(app)` route group, so `RequireSession` already guards it.

- [ ] **Step 1: Write the digest page**

Create `src/app/(app)/digest/page.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { MatchCard } from "@/frontend/components/feed/match-card";
import { Button } from "@/frontend/components/ui/button";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import {
    useDigest,
    useMarkDigestSeen,
    useSetMatchStatus,
} from "@/frontend/hooks/api";

export default function DigestPage() {
    const digest = useDigest();
    const markSeen = useMarkDigestSeen();
    const setStatus = useSetMatchStatus();

    const matches = digest.data?.matches ?? [];

    let body: ReactNode;
    if (digest.isPending) {
        body = (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    } else if (matches.length === 0) {
        body = (
            <p className="text-muted-foreground text-sm">
                Estás al día. No hay nuevas oportunidades por ahora.
            </p>
        );
    } else {
        body = (
            <div className="flex flex-col gap-3">
                {matches.map((item) => (
                    <MatchCard
                        key={item.id}
                        item={item}
                        isPending={
                            setStatus.isPending &&
                            setStatus.variables?.id === item.id
                        }
                        onSave={(id) =>
                            setStatus.mutate({ id, status: "saved" })
                        }
                        onDismiss={(id) =>
                            setStatus.mutate({ id, status: "dismissed" })
                        }
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="font-semibold text-foreground text-xl">
                        Tu digest
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Más de 100 correos al mes, ahora en un solo resumen.
                    </p>
                </div>
                {matches.length > 0 ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markSeen.mutate()}
                        disabled={markSeen.isPending}
                    >
                        Marcar como visto
                    </Button>
                ) : null}
            </div>
            {body}
        </div>
    );
}
```

- [ ] **Step 2: Add the nav link**

In `src/frontend/components/app-nav.tsx`, between the Feed `<Link>` and the Perfil `<Link>`, add:

```tsx
                    <Link
                        href="/digest"
                        className={buttonClasses("ghost", "sm")}
                    >
                        Digest
                    </Link>
```

- [ ] **Step 3: Verify type-check + build**

Run: `pnpm check && pnpm build`
Expected: exit 0; build lists the `/digest` route.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/digest/page.tsx" src/frontend/components/app-nav.tsx
git commit -m "feat(spec-07): in-app Tu digest page + nav link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Vercel cron schedule

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write `vercel.json`**

Create `vercel.json` at the repo root:

```json
{
    "crons": [
        {
            "path": "/api/cron/digest",
            "schedule": "0 13 * * *"
        }
    ]
}
```

(Daily at 13:00 UTC ≈ 08:00 in Peru. Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` to cron paths when `CRON_SECRET` is configured in the project env.)

- [ ] **Step 2: Verify it is valid JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('vercel.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(spec-07): daily Vercel cron for /api/cron/digest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Demo seed script

**Files:**
- Create: `scripts/seed-demo.ts`
- Modify: `package.json`

Deterministic offline demo: seeds a curated profile + jobs (real embeddings) + an `ingestion_runs` row for a user resolved by email, then runs matching. No Gmail required.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-demo.ts`:

```ts
import { config } from "dotenv";

config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { buildJobEmbeddingText } from "@/server/services/ingestion";
import { embedText } from "@/server/ai/embed";
import { computeDedupeHash } from "@/server/services/dedupe";
import { db } from "@/server/drizzle/db";
import { user } from "@/server/drizzle/schemas/auth-schema";
import { ingestionRuns } from "@/server/drizzle/schemas/ingestion-runs";
import { jobs } from "@/server/drizzle/schemas/jobs";
import { profiles } from "@/server/drizzle/schemas/profiles";
import { buildProfileEmbeddingText } from "@/server/services/profile";
import { runMatching } from "@/server/services/matching";

const SEED_WEEK_DATE = "2026-06-10";

interface DemoJob {
    titulo: string;
    empresa: string;
    modalidad: string;
    ubicacion: string | null;
    salarioMin: number | null;
    salarioMax: number | null;
    moneda: string | null;
    salarioPeriodo: string | null;
    salarioExplicito: boolean;
    requisitos: string;
    skills: string[];
    applyLink: string;
}

const DEMO_PROFILE = {
    escuelaProfesional: "Ingeniería de Sistemas",
    grado: "egresado",
    ubicacion: "Arequipa",
    skills: ["JavaScript", "TypeScript", "React", "Node.js", "SQL", "Python"],
    experienciaResumen:
        "Egresado de Ingeniería de Sistemas con prácticas en desarrollo web full-stack y bases de datos.",
    intereses: ["desarrollo web", "backend", "datos"],
    expectativaSalarial: 3000,
};

const DEMO_JOBS: DemoJob[] = [
    {
        titulo: "Desarrollador Backend Node.js",
        empresa: "TechAQP",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: 3500,
        salarioMax: 4500,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos:
            "Node.js, TypeScript, PostgreSQL, APIs REST. 1+ año de experiencia.",
        skills: ["Node.js", "TypeScript", "PostgreSQL"],
        applyLink: "https://empleos.example/backend-node",
    },
    {
        titulo: "Frontend Developer React",
        empresa: "Innova Labs",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: 3000,
        salarioMax: 3800,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "React, TypeScript, CSS. Portafolio requerido.",
        skills: ["React", "TypeScript", "CSS"],
        applyLink: "https://empleos.example/frontend-react",
    },
    {
        titulo: "Analista de Datos Junior",
        empresa: "DataPeru",
        modalidad: "presencial",
        ubicacion: "Arequipa",
        salarioMin: 2800,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "SQL, Python, Power BI. Egresado de carreras afines.",
        skills: ["SQL", "Python", "Power BI"],
        applyLink: "https://empleos.example/data-junior",
    },
    {
        titulo: "Practicante de Desarrollo Web",
        empresa: "StartupX",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: 1200,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "HTML, CSS, JavaScript. Ganas de aprender.",
        skills: ["JavaScript", "HTML", "CSS"],
        applyLink: "https://empleos.example/practicante-web",
    },
    {
        titulo: "Ingeniero de Software Full-Stack",
        empresa: "Consultora Andina",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: 4000,
        salarioMax: 5500,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "React, Node.js, SQL, Git. 2+ años.",
        skills: ["React", "Node.js", "SQL"],
        applyLink: "https://empleos.example/fullstack",
    },
    {
        titulo: "Soporte Técnico TI",
        empresa: "ServiTec",
        modalidad: "presencial",
        ubicacion: "Arequipa",
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Conocimiento de redes y hardware. Atención al cliente.",
        skills: ["Redes", "Hardware"],
        applyLink: "https://empleos.example/soporte-ti",
    },
    {
        titulo: "Desarrollador Python (ETL)",
        empresa: "FinData",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Python, pandas, SQL. Procesos ETL.",
        skills: ["Python", "SQL"],
        applyLink: "https://empleos.example/python-etl",
    },
    {
        titulo: "QA Tester",
        empresa: "Calidad Soft",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Pruebas manuales y automatizadas. Detalle.",
        skills: ["Testing", "QA"],
        applyLink: "https://empleos.example/qa-tester",
    },
    {
        titulo: "Asistente Administrativo",
        empresa: "Oficina Central",
        modalidad: "presencial",
        ubicacion: "Lima",
        salarioMin: 1500,
        salarioMax: null,
        moneda: "PEN",
        salarioPeriodo: "mes",
        salarioExplicito: true,
        requisitos: "Manejo de Excel y organización. No técnico.",
        skills: ["Excel", "Organización"],
        applyLink: "https://empleos.example/admin",
    },
    {
        titulo: "Community Manager",
        empresa: "Marca Digital",
        modalidad: "remoto",
        ubicacion: null,
        salarioMin: null,
        salarioMax: null,
        moneda: null,
        salarioPeriodo: null,
        salarioExplicito: false,
        requisitos: "Redes sociales, creación de contenido.",
        skills: ["Marketing", "Redes sociales"],
        applyLink: "https://empleos.example/community",
    },
];

function parseEmail(argv: string[]): string {
    for (const arg of argv) {
        if (arg.startsWith("--email=")) {
            return arg.slice("--email=".length);
        }
    }
    throw new Error(
        "Usage: pnpm db:seed-demo -- --email=<your-signed-in-email>",
    );
}

async function main(): Promise<void> {
    const email = parseEmail(process.argv.slice(2));

    const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
    if (!row) {
        throw new Error(
            `No user with email ${email}. Sign in once in the app first, then re-run.`,
        );
    }
    const userId = row.id;

    // Profile (with embedding) so matching has something to score against.
    const profileEmbedding = await embedText(
        buildProfileEmbeddingText({
            escuelaProfesional: DEMO_PROFILE.escuelaProfesional,
            skills: DEMO_PROFILE.skills,
            experienciaResumen: DEMO_PROFILE.experienciaResumen,
            intereses: DEMO_PROFILE.intereses,
        }),
    );
    const profileFields = {
        escuelaProfesional: DEMO_PROFILE.escuelaProfesional,
        grado: DEMO_PROFILE.grado,
        ubicacion: DEMO_PROFILE.ubicacion,
        skills: DEMO_PROFILE.skills,
        experienciaResumen: DEMO_PROFILE.experienciaResumen,
        intereses: DEMO_PROFILE.intereses,
        expectativaSalarial: DEMO_PROFILE.expectativaSalarial,
        embedding: profileEmbedding,
    };
    await db
        .insert(profiles)
        .values({ userId, ...profileFields })
        .onConflictDoUpdate({
            target: profiles.userId,
            set: { ...profileFields, updatedAt: new Date() },
        });
    console.log("seeded profile");

    // Jobs (with embeddings). onConflictDoNothing keeps re-runs idempotent.
    let inserted = 0;
    for (let i = 0; i < DEMO_JOBS.length; i++) {
        const j = DEMO_JOBS[i];
        const embedding = await embedText(
            buildJobEmbeddingText({
                titulo: j.titulo,
                requisitos: j.requisitos,
                skills: j.skills,
            }),
        );
        const result = await db
            .insert(jobs)
            .values({
                userId,
                gmailMsgId: `demo-${i + 1}`,
                sourceSender: "demo@careerboost.local",
                titulo: j.titulo,
                empresa: j.empresa,
                modalidad: j.modalidad,
                ubicacion: j.ubicacion,
                salarioMin: j.salarioMin,
                salarioMax: j.salarioMax,
                moneda: j.moneda,
                salarioPeriodo: j.salarioPeriodo,
                salarioExplicito: j.salarioExplicito,
                requisitos: j.requisitos,
                skills: j.skills,
                applyLink: j.applyLink,
                isJob: true,
                dedupeHash: computeDedupeHash({
                    titulo: j.titulo,
                    empresa: j.empresa,
                    weekDate: SEED_WEEK_DATE,
                }),
                embedding,
            })
            .onConflictDoNothing()
            .returning({ id: jobs.id });
        inserted += result.length;
    }
    console.log(`seeded ${inserted} jobs (of ${DEMO_JOBS.length})`);

    // An ingestion run so the impact panel shows the 27%-noise narrative.
    await db.insert(ingestionRuns).values({
        userId,
        finishedAt: new Date(),
        emailsScanned: 40,
        jobsFound: DEMO_JOBS.length,
        noiseFiltered: 11,
        dupesRemoved: 3,
    });
    console.log("seeded ingestion run");

    const { count } = await runMatching({ userId });
    console.log(`matching done: ${count} matches`);

    console.log(
        `\nDemo ready for ${email}. Open /feed and /digest in the app.`,
    );
    process.exit(0);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
```

> Note: `DEMO_JOBS[i]` is safe to index without a guard — `tsconfig` does NOT enable `noUncheckedIndexedAccess`, and the loop bound is `DEMO_JOBS.length`.

- [ ] **Step 2: Add the package.json script**

In `package.json`, in `"scripts"`, after the `"db:init"` line add:

```json
        "db:init": "tsx scripts/db-init.ts",
        "db:seed-demo": "tsx scripts/seed-demo.ts",
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm check`
Expected: exit 0 (the script is included by `tsc` via the `**/*.ts` include).

- [ ] **Step 4: Manual run (requires a signed-in user + DB + GEMINI_API_KEY)**

Run: `pnpm db:seed-demo -- --email=you@example.com`
Expected: logs `seeded profile`, `seeded N jobs`, `seeded ingestion run`, `matching done: N matches`, then the "Demo ready" line. Open `/feed` (cards + impact panel) and `/digest` (new matches).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-demo.ts package.json
git commit -m "feat(spec-07): deterministic offline demo seed script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Demo guion + setup doc

**Files:**
- Create: `docs/demo/guion.md`

- [ ] **Step 1: Write the demo doc**

Create `docs/demo/guion.md`:

```markdown
# CareerBoost — Guion de demo (3 min) y preparación

## Preparación (elige una vía)

### Vía A — Seed offline (recomendada, sin Gmail)
1. Inicia sesión una vez en la app con tu cuenta Google (crea el usuario).
2. Corre el seed con tu correo:
   ```
   pnpm db:seed-demo -- --email=tu-correo@example.com
   ```
   Esto crea un perfil de egresado de Ingeniería de Sistemas, ~10 vacantes
   (con y sin salario, distintas modalidades), una corrida de ingesta con la
   métrica de ruido, y ejecuta el match. Tras correrlo, `/feed` y `/digest`
   quedan poblados.

### Vía B — Cuenta Gmail de prueba (auténtica)
1. Crea/usa una cuenta Gmail de prueba.
2. Reenvía 20-40 correos representativos de la bolsa (mezcla: empleos con
   salario, empleos sin salario, y ruido no-empleo). Ver "Correos de ejemplo".
3. En la app: conectar Gmail (solo lectura) → subir CV → sincronizar →
   generar matches.

## Guion (3 minutos)
1. **Problema (20s):** "Un egresado recibe +100 correos al mes. 27% es ruido,
   90% de las vacantes no dicen el salario."
2. **Onboarding (40s):** Conectar Gmail (solo lectura) + subir CV →
   sincronizar. (En modo seed, muestra `/feed` ya poblado.)
3. **Panel de impacto (25s):** escaneados / ruido filtrado / empleos reales /
   para mí — el ruido se ve filtrado.
4. **Feed (45s):** cards con % de match, "por qué te lo recomendamos", badges
   de salario (verde = explícito, gris = no especificado).
5. **Filtro "solo con salario" (20s):** claridad frente al 90% opaco.
6. **Digest (30s):** abre `/digest` → "100+ correos al mes en 1 resumen".
   Marca como visto → la próxima corrida solo trae lo nuevo.

## Correos de ejemplo (para la Vía B)

**Empleo con salario (real):**
```
Asunto: Convocatoria Desarrollador Backend - Arequipa
Empresa TechAQP busca Desarrollador Backend Node.js.
Modalidad remoto. Sueldo S/ 3500 - 4500 mensual.
Requisitos: Node.js, TypeScript, PostgreSQL.
Postular: https://empleos.example/backend-node
```

**Empleo sin salario (real, opaco):**
```
Asunto: Analista de Datos - Oportunidad
Consultora busca Analista de Datos. Modalidad presencial, Arequipa.
Remuneración acorde al mercado.
Requisitos: SQL, Python, Power BI.
```

**Ruido (no es empleo):**
```
Asunto: Webinar gratuito de liderazgo este viernes
Inscríbete al webinar de liderazgo para egresados.
Cupos limitados. No requiere experiencia.
```

## Verificación del cron (opcional)
- Sin secret → 401:
  ```
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/digest
  ```
- Con secret → corre ingesta+match+digest:
  ```
  curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
  ```
- Con `RESEND_API_KEY` configurado, se envía 1 correo de digest; sin ella,
  degrada a in-app (solo `/digest`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/demo/guion.md
git commit -m "docs(spec-07): demo guion + setup (seed + Gmail paths)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual Verification (after all tasks)

No DOM test runner, so the suite covers only pure logic. Verify the rest by hand:

1. `pnpm check` → exit 0 (Biome + tsc).
2. `pnpm test` → all green (existing 107 + new `cron-auth` 4 / `google-oauth` 4 / `digest-email` 7 = ~122 tests).
3. `pnpm build` → succeeds; routes include `/api/cron/digest`, `/digest`, plus the existing `/`, `/onboarding`, `/feed`, `/perfil`.
4. **Cron auth:** `curl` without auth → `401`; with `Authorization: Bearer $CRON_SECRET` → `{"ok":true,...}`.
5. **In-app digest:** sign in → `pnpm db:seed-demo -- --email=<you>` → `/digest` shows new matches → "Marcar como visto" empties it (and feed still shows them as seen) → `/feed` still lists them.
6. **Email (optional):** set `RESEND_API_KEY` (and a verified `RESEND_FROM`, or the `onboarding@resend.dev` default to your own inbox) → trigger cron → 1 digest email arrives. Without the key → no email, in-app still works.
7. **Refresh-token assumption:** confirm the demo user's `account.refresh_token` is a usable plaintext token (Google grant via `accessType: "offline"` + consent). If a future better-auth config encrypts tokens at rest, the cron's direct refresh would need adjustment — but the seed-demo path does not depend on Gmail and always works for the demo.
8. **Security spot-check:** grep the new server code for token/body logging — there should be none; `runDigest` logs only `userId` + error message.

## Self-Review (plan vs spec)

- **`GET /api/cron/digest` with secret runs ingest+match+digest** → Tasks 6 + 7. ✅
- **Without secret → 401** → Tasks 2 + 7 (tested + curl). ✅
- **Digest view shows only new matches** → `getDigest` filters `status="new"` (Task 4); page Task 10. ✅
- **With `RESEND_API_KEY` → 1 email; without → in-app only** → `runDigest` gates on the key (Task 6); builder/sender Task 5. ✅
- **Full demo runs end to end** → seed script Task 12 + guion Task 13 (+ Gmail path documented). ✅
- **Out of scope honored** — no WhatsApp/push, no per-user frequency prefs, no rich templates (minimal HTML), no cross-day email de-dup (Decision 6). ✅
- **Constraints** — read-only Gmail, no token/PII/body logging, per-user isolation (session id for in-app; userId-scoped ops in cron), secrets from env, no type suppression, no new migration. ✅
- **Type consistency** — `FeedItem`/`mapFeedRow`/`FeedRow` shared; `DigestUser`, `GoogleTokenRefresh`, `DigestEmailPayload`, `DigestRunResult` defined once and reused; eden paths `api.digest.get` / `apiClient.api.v1.digest.seen.post` match the router prefix `/digest` + `.post("/seen")`. ✅
```
