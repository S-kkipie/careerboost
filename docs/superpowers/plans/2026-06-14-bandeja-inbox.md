# Bandeja de Entrada (Inbox Panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/bandeja` page that shows every email from the UNSA bolsa sender(s) as an inbox — convocatorias as primary content, filtered noise made explicit with a count, each row opening the exact message in Gmail.

**Architecture:** Read-only, mostly frontend. One small migration adds display metadata (`subject`/`sender`/`internal_date`) to `ingested_messages`, populated during the existing sync. A new `/api/v1/inbox` router exposes a stored list (instant, DB) and a live diff (`/inbox/live`) that surfaces not-yet-synced emails. The `(app)` page reuses `RequireOnboarded`. **Zod is the schema source of truth**; types come from `z.infer`, and the Elysia handlers `.parse()` their output so Eden Treaty infers the frontend types.

**Tech Stack:** Next.js 16 App Router + React 19, Elysia 1.4 + Eden Treaty, Drizzle ORM + Postgres, Zod 4, TanStack Query, shadcn/ui, lucide-react, Biome, Vitest (node env).

---

## File Structure

**Backend**
- Modify `src/server/drizzle/schemas/ingested-messages.ts` — add `subject`, `sender`, `internalDate` columns.
- Generate `drizzle/0005_*.sql` — migration via `pnpm db:generate`.
- Modify `src/server/services/ingestion.ts` — add `toDate` helper; extend `recordIngestedMessage` with optional metadata; pass metadata at both call sites.
- Create `src/server/routers/inbox.schema.ts` — Zod schemas + `z.infer` types (source of truth).
- Modify `src/server/services/gmail.ts` — add `getMessageMetadata` (headers only).
- Create `src/server/services/inbox.ts` — pure mappers (`mapInboxRow`, `diffNewIds`) + `getStoredInbox` / `getUnprocessedInbox`.
- Create `src/server/routers/inbox.ts` — `GET /inbox` + `GET /inbox/live`.
- Modify `src/server/router.ts` — mount `inboxRouter`.

**Frontend**
- Create `src/frontend/lib/gmail-link.ts` — `gmailMessageUrl`.
- Modify `src/frontend/lib/format.ts` — add `formatRelativeDay`.
- Modify `src/frontend/hooks/api.ts` — `useInbox`, `useInboxLive`.
- Add `src/frontend/components/ui/collapsible.tsx` — via shadcn CLI.
- Create `src/frontend/components/bandeja/` — `inbox-summary-banner.tsx`, `inbox-row.tsx`, `filtered-section.tsx`, `refresh-from-gmail-button.tsx`, `inbox-list.tsx`.
- Create `src/app/(app)/bandeja/page.tsx` — the page.
- Modify `src/frontend/components/app-nav.tsx` — add "Bandeja" link.

**Tests**
- `src/server/services/ingestion.test.ts` — add `toDate` cases (existing `recordIngestedMessage` calls stay valid — new fields optional).
- `src/server/routers/inbox.schema.test.ts` — schema accepts/rejects.
- `src/server/services/inbox.test.ts` — `mapInboxRow`, `diffNewIds`.
- `src/server/routers/inbox.test.ts` — auth gating (401).
- `src/frontend/lib/gmail-link.test.ts` — URL building.
- `src/frontend/lib/format.test.ts` — add `formatRelativeDay` cases.

Verification gates per task: `pnpm test`, `pnpm check` (biome + `tsc --noEmit`). Final task also runs `pnpm build`.

---

## Task 1: Metadata columns + migration + sync capture

**Files:**
- Modify: `src/server/drizzle/schemas/ingested-messages.ts`
- Modify: `src/server/services/ingestion.ts`
- Test: `src/server/services/ingestion.test.ts`
- Generate: `drizzle/0005_*.sql`

- [ ] **Step 1: Write the failing test for `toDate`**

Add to `src/server/services/ingestion.test.ts` (add `toDate` to the existing import from `@/server/services/ingestion`):

```ts
describe("toDate", () => {
    it("parses a valid RFC date header to a Date", () => {
        const d = toDate("Mon, 02 Jun 2026 10:00:00 +0000");
        expect(d).toBeInstanceOf(Date);
        expect(d?.toISOString()).toBe("2026-06-02T10:00:00.000Z");
    });

    it("returns null for null or unparseable input", () => {
        expect(toDate(null)).toBeNull();
        expect(toDate("not a date")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/services/ingestion.test.ts`
Expected: FAIL — `toDate` is not exported.

- [ ] **Step 3: Add columns to the schema**

In `src/server/drizzle/schemas/ingested-messages.ts`, add three columns inside the table definition, right before `createdAt`:

```ts
        noiseReason: text("noise_reason"),
        subject: text("subject"),
        sender: text("sender"),
        internalDate: timestamp("internal_date"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
```

(`timestamp` is already imported in this file.)

- [ ] **Step 4: Add `toDate` and extend `recordIngestedMessage` in the ingestion service**

In `src/server/services/ingestion.ts`, add the helper next to `toIsoDate`:

```ts
export function toDate(headerDate: string | null): Date | null {
    if (!headerDate) {
        return null;
    }
    const d = new Date(headerDate);
    return Number.isNaN(d.getTime()) ? null : d;
}
```

Replace `recordIngestedMessage` with the metadata-aware version (new fields optional so existing callers/tests stay valid):

```ts
// Record that a user's Gmail message was processed (idempotent per user+msg).
// jobId is null when the email was classified as noise. Display metadata
// (subject/sender/internalDate) is captured here for the bandeja inbox.
export async function recordIngestedMessage(row: {
    userId: string;
    gmailMsgId: string;
    jobId: string | null;
    noiseReason: string | null;
    subject?: string | null;
    sender?: string | null;
    internalDate?: Date | null;
}): Promise<void> {
    await db
        .insert(ingestedMessages)
        .values({
            userId: row.userId,
            gmailMsgId: row.gmailMsgId,
            jobId: row.jobId,
            noiseReason: row.noiseReason,
            subject: row.subject ?? null,
            sender: row.sender ?? null,
            internalDate: row.internalDate ?? null,
        })
        .onConflictDoNothing({
            target: [ingestedMessages.userId, ingestedMessages.gmailMsgId],
        });
}
```

- [ ] **Step 5: Pass metadata at both call sites**

In `ingestOneJob` (the job branch), update the `recordIngestedMessage` call:

```ts
    await recordIngestedMessage({
        userId,
        gmailMsgId: msg.id,
        jobId,
        noiseReason: null,
        subject: msg.subject,
        sender: msg.sender,
        internalDate: toDate(msg.date),
    });
```

In `runIngestion` (the noise branch, inside the `if (!classified.is_job)` block):

```ts
                    await recordIngestedMessage({
                        userId,
                        gmailMsgId: id,
                        jobId: null,
                        noiseReason: classified.noise_reason,
                        subject: msg.subject,
                        sender: msg.sender,
                        internalDate: toDate(msg.date),
                    });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/server/services/ingestion.test.ts`
Expected: PASS (including the existing `recordIngestedMessage` cases — unchanged because the new fields are optional).

- [ ] **Step 7: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0005_*.sql` adding `subject`, `sender`, `internal_date` to `ingested_messages`, plus updated `drizzle/meta`. Do not hand-edit it.

- [ ] **Step 8: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/server/drizzle/schemas/ingested-messages.ts src/server/services/ingestion.ts src/server/services/ingestion.test.ts drizzle/
git commit -m "feat(bandeja): capture email metadata on ingested_messages (migration 0005)"
```

---

## Task 2: Zod schemas (source of truth)

**Files:**
- Create: `src/server/routers/inbox.schema.ts`
- Test: `src/server/routers/inbox.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/inbox.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    inboxLiveResponseSchema,
    inboxResponseSchema,
} from "@/server/routers/inbox.schema";

describe("inboxResponseSchema", () => {
    it("accepts a well-formed response", () => {
        const value = {
            counts: { total: 3, convocatorias: 1, filtrados: 2 },
            items: [
                {
                    gmailMsgId: "m1",
                    subject: "Practicante",
                    sender: "bolsa@unsa.edu.pe",
                    date: "2026-06-02T10:00:00.000Z",
                    kind: "convocatoria",
                    noiseReason: null,
                    jobId: "job-1",
                    titulo: "Practicante de Sistemas",
                    empresa: "Municipalidad",
                },
            ],
        };
        expect(inboxResponseSchema.parse(value)).toEqual(value);
    });

    it("rejects an invalid kind", () => {
        const bad = {
            counts: { total: 0, convocatorias: 0, filtrados: 0 },
            items: [
                {
                    gmailMsgId: "m1",
                    subject: null,
                    sender: null,
                    date: null,
                    kind: "otro",
                    noiseReason: null,
                    jobId: null,
                    titulo: null,
                    empresa: null,
                },
            ],
        };
        expect(() => inboxResponseSchema.parse(bad)).toThrow();
    });
});

describe("inboxLiveResponseSchema", () => {
    it("accepts unprocessed items", () => {
        const value = {
            unprocessed: [
                { gmailMsgId: "m9", subject: "Nueva", sender: "x", date: null },
            ],
        };
        expect(inboxLiveResponseSchema.parse(value)).toEqual(value);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/routers/inbox.schema.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the schema module**

Create `src/server/routers/inbox.schema.ts`:

```ts
import { z } from "zod";

// Zod is the source of truth for inbox shapes; types are derived via z.infer.
// The Elysia handlers .parse() their output, so Eden Treaty infers the
// frontend types from these schemas — no hand-written interfaces anywhere.

export const inboxKindSchema = z.enum(["convocatoria", "filtrado"]);

export const inboxItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(), // ISO string from internal_date, or null
    kind: inboxKindSchema,
    noiseReason: z.string().nullable(), // set when kind === "filtrado"
    jobId: z.string().nullable(), // set when kind === "convocatoria"
    titulo: z.string().nullable(), // joined jobs row (convocatoria)
    empresa: z.string().nullable(), // joined jobs row (convocatoria)
});

export const inboxCountsSchema = z.object({
    total: z.number(),
    convocatorias: z.number(),
    filtrados: z.number(),
});

export const inboxResponseSchema = z.object({
    counts: inboxCountsSchema,
    items: z.array(inboxItemSchema),
});

export const inboxLiveItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(),
});

export const inboxLiveResponseSchema = z.object({
    unprocessed: z.array(inboxLiveItemSchema),
});

export type InboxKind = z.infer<typeof inboxKindSchema>;
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxCounts = z.infer<typeof inboxCountsSchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;
export type InboxLiveItem = z.infer<typeof inboxLiveItemSchema>;
export type InboxLiveResponse = z.infer<typeof inboxLiveResponseSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/routers/inbox.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/inbox.schema.ts src/server/routers/inbox.schema.test.ts
git commit -m "feat(bandeja): zod schemas for inbox (source of truth, z.infer types)"
```

---

## Task 3: Gmail metadata helper

**Files:**
- Modify: `src/server/services/gmail.ts`

(No unit test — `fetch`-based Gmail helpers in this file are verified via `pnpm check` + `pnpm build` + manual walk, consistent with `getMessage`/`listJobMessageIds`.)

- [ ] **Step 1: Add the metadata type and helper**

In `src/server/services/gmail.ts`, append after `getMessage`:

```ts
export interface GmailMessageMetadata {
    id: string;
    sender: string | null;
    subject: string | null;
    date: string | null; // raw Date header
}

// Fetches only the headers we display in the bandeja (no body is ever fetched
// here — lighter, and avoids touching message content for a transparency view).
export async function getMessageMetadata(
    accessToken: string,
    messageId: string,
): Promise<GmailMessageMetadata> {
    const url = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    );
    url.searchParams.set("format", "metadata");
    url.searchParams.append("metadataHeaders", "Subject");
    url.searchParams.append("metadataHeaders", "From");
    url.searchParams.append("metadataHeaders", "Date");
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
    };
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/server/services/gmail.ts
git commit -m "feat(bandeja): add getMessageMetadata (headers only) to gmail client"
```

---

## Task 4: Inbox service

**Files:**
- Create: `src/server/services/inbox.ts`
- Test: `src/server/services/inbox.test.ts`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `src/server/services/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffNewIds, mapInboxRow } from "@/server/services/inbox";

describe("mapInboxRow", () => {
    it("maps a job row to a convocatoria item with ISO date", () => {
        const item = mapInboxRow({
            gmailMsgId: "m1",
            subject: "Asunto",
            sender: "bolsa@unsa.edu.pe",
            internalDate: new Date("2026-06-02T10:00:00.000Z"),
            noiseReason: null,
            jobId: "job-1",
            titulo: "Practicante",
            empresa: "Municipalidad",
        });
        expect(item.kind).toBe("convocatoria");
        expect(item.date).toBe("2026-06-02T10:00:00.000Z");
        expect(item.titulo).toBe("Practicante");
    });

    it("maps a noise row to a filtrado item with null date", () => {
        const item = mapInboxRow({
            gmailMsgId: "m2",
            subject: "Boletín",
            sender: "bolsa@unsa.edu.pe",
            internalDate: null,
            noiseReason: "no es convocatoria",
            jobId: null,
            titulo: null,
            empresa: null,
        });
        expect(item.kind).toBe("filtrado");
        expect(item.date).toBeNull();
        expect(item.noiseReason).toBe("no es convocatoria");
    });
});

describe("diffNewIds", () => {
    it("returns only ids not already stored", () => {
        expect(diffNewIds(["a", "b", "c"], new Set(["b"]))).toEqual(["a", "c"]);
    });

    it("returns empty when all stored", () => {
        expect(diffNewIds(["a"], new Set(["a"]))).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/services/inbox.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the service**

Create `src/server/services/inbox.ts`:

```ts
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { ServerConfig } from "@/config/server-config";
import { db } from "@/server/drizzle/db";
import { ingestedMessages } from "@/server/drizzle/schemas/ingested-messages";
import { jobs } from "@/server/drizzle/schemas/jobs";
import type {
    InboxItem,
    InboxLiveItem,
    InboxResponse,
} from "@/server/routers/inbox.schema";
import {
    buildGmailQuery,
    getMessageMetadata,
    INGEST_MAX_MESSAGES,
    INGEST_NEWER_THAN_DAYS,
    listJobMessageIds,
    resolveSenders,
} from "./gmail";
import { toDate } from "./ingestion";

interface InboxRow {
    gmailMsgId: string;
    subject: string | null;
    sender: string | null;
    internalDate: Date | null;
    noiseReason: string | null;
    jobId: string | null;
    titulo: string | null;
    empresa: string | null;
}

// Pure: a DB row -> API item. A row with a jobId is a kept convocatoria;
// otherwise it was filtered as noise.
export function mapInboxRow(row: InboxRow): InboxItem {
    return {
        gmailMsgId: row.gmailMsgId,
        subject: row.subject,
        sender: row.sender,
        date: row.internalDate ? row.internalDate.toISOString() : null,
        kind: row.jobId ? "convocatoria" : "filtrado",
        noiseReason: row.noiseReason,
        jobId: row.jobId,
        titulo: row.titulo,
        empresa: row.empresa,
    };
}

// Pure: which of the live-listed ids are not yet stored for this user.
export function diffNewIds(allIds: string[], storedIds: Set<string>): string[] {
    return allIds.filter((id) => !storedIds.has(id));
}

const INBOX_ITEM_LIMIT = 100;

// Stored, already-classified inbox for a user (instant; DB only). Counts span
// the full set even though items are capped.
export async function getStoredInbox(userId: string): Promise<InboxResponse> {
    const rows = await db
        .select({
            gmailMsgId: ingestedMessages.gmailMsgId,
            subject: ingestedMessages.subject,
            sender: ingestedMessages.sender,
            internalDate: ingestedMessages.internalDate,
            noiseReason: ingestedMessages.noiseReason,
            jobId: ingestedMessages.jobId,
            titulo: jobs.titulo,
            empresa: jobs.empresa,
        })
        .from(ingestedMessages)
        .leftJoin(jobs, eq(ingestedMessages.jobId, jobs.id))
        .where(eq(ingestedMessages.userId, userId))
        .orderBy(sql`${ingestedMessages.internalDate} desc nulls last`)
        .limit(INBOX_ITEM_LIMIT);

    const [agg] = await db
        .select({
            total: count(),
            convocatorias: count(ingestedMessages.jobId),
        })
        .from(ingestedMessages)
        .where(eq(ingestedMessages.userId, userId));

    const total = agg?.total ?? 0;
    const convocatorias = agg?.convocatorias ?? 0;
    return {
        counts: { total, convocatorias, filtrados: total - convocatorias },
        items: rows.map(mapInboxRow),
    };
}

// Live diff: bolsa emails present in Gmail but not yet synced for this user.
// One messages.list call + a headers-only fetch per *new* id (bounded).
export async function getUnprocessedInbox(
    userId: string,
    accessToken: string,
): Promise<InboxLiveItem[]> {
    const senders = resolveSenders(ServerConfig.ingest.senders);
    const query = buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS);
    const ids = await listJobMessageIds(accessToken, query, INGEST_MAX_MESSAGES);
    if (ids.length === 0) {
        return [];
    }
    const storedRows = await db
        .select({ gmailMsgId: ingestedMessages.gmailMsgId })
        .from(ingestedMessages)
        .where(
            and(
                eq(ingestedMessages.userId, userId),
                inArray(ingestedMessages.gmailMsgId, ids),
            ),
        );
    const stored = new Set(storedRows.map((r) => r.gmailMsgId));
    const fresh = diffNewIds(ids, stored);

    const items: InboxLiveItem[] = [];
    for (const id of fresh) {
        try {
            const m = await getMessageMetadata(accessToken, id);
            const parsed = toDate(m.date);
            items.push({
                gmailMsgId: m.id,
                subject: m.subject,
                sender: m.sender,
                date: parsed ? parsed.toISOString() : null,
            });
        } catch {
            // Tolerate a single failed metadata fetch; never log raw content.
        }
    }
    return items;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/services/inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/server/services/inbox.ts src/server/services/inbox.test.ts
git commit -m "feat(bandeja): inbox service (stored list + live unprocessed diff)"
```

---

## Task 5: Inbox router + mount

**Files:**
- Create: `src/server/routers/inbox.ts`
- Modify: `src/server/router.ts`
- Test: `src/server/routers/inbox.test.ts`

- [ ] **Step 1: Write the failing auth-gating test**

Create `src/server/routers/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import app from "@/server/router";

describe("/api/v1/inbox (auth gating)", () => {
    it("GET /inbox returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });

    it("GET /inbox/live returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox/live"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/routers/inbox.test.ts`
Expected: FAIL — `/api/v1/inbox` returns the `NOT_FOUND` shape, not 401.

- [ ] **Step 3: Create the router**

Create `src/server/routers/inbox.ts`:

```ts
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import {
    GmailApiError,
    GmailNotConnectedError,
    getGoogleAccessToken,
} from "@/server/services/gmail";
import { getStoredInbox, getUnprocessedInbox } from "@/server/services/inbox";
import { inboxLiveResponseSchema, inboxResponseSchema } from "./inbox.schema";

export const inboxRouter = new Elysia({ prefix: "/inbox" })
    .get("/", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        const data = await getStoredInbox(session.user.id);
        // .parse() validates our mapping and yields the z.infer type so Eden
        // infers the frontend response type from the Zod schema.
        return inboxResponseSchema.parse(data);
    })
    .get("/live", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            const unprocessed = await getUnprocessedInbox(
                session.user.id,
                token,
            );
            return inboxLiveResponseSchema.parse({ unprocessed });
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
    });
```

- [ ] **Step 4: Mount the router**

In `src/server/router.ts`, add the import (alphabetical with the others):

```ts
import { inboxRouter } from "@/server/routers/inbox";
```

And add `.use(inboxRouter)` to the chain (after `.use(ingestRouter)`):

```ts
    .use(ingestRouter)
    .use(inboxRouter)
    .use(matchRouter)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/server/routers/inbox.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/server/routers/inbox.ts src/server/routers/inbox.test.ts src/server/router.ts
git commit -m "feat(bandeja): inbox router (GET /inbox + /inbox/live) mounted"
```

---

## Task 6: Frontend helpers (deep-link + relative date)

**Files:**
- Create: `src/frontend/lib/gmail-link.ts`
- Test: `src/frontend/lib/gmail-link.test.ts`
- Modify: `src/frontend/lib/format.ts`
- Test: `src/frontend/lib/format.test.ts`

- [ ] **Step 1: Write the failing test for `gmailMessageUrl`**

Create `src/frontend/lib/gmail-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";

describe("gmailMessageUrl", () => {
    it("builds an authuser URL with the encoded email", () => {
        expect(gmailMessageUrl("a+b@unsa.edu.pe", "msg123")).toBe(
            "https://mail.google.com/mail/?authuser=a%2Bb%40unsa.edu.pe#all/msg123",
        );
    });

    it("falls back to u/0 when no email", () => {
        expect(gmailMessageUrl(null, "msg123")).toBe(
            "https://mail.google.com/mail/u/0/#all/msg123",
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/frontend/lib/gmail-link.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the helper**

Create `src/frontend/lib/gmail-link.ts`:

```ts
// Builds a Gmail web URL that opens an exact message. The Gmail API message id
// is valid in the #all/<id> fragment; authuser disambiguates multiple accounts.
export function gmailMessageUrl(
    email: string | null | undefined,
    gmailMsgId: string,
): string {
    if (!email) {
        return `https://mail.google.com/mail/u/0/#all/${gmailMsgId}`;
    }
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${gmailMsgId}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/frontend/lib/gmail-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `formatRelativeDay`**

Add to `src/frontend/lib/format.test.ts` (add `formatRelativeDay` to the existing import from `@/frontend/lib/format`):

```ts
describe("formatRelativeDay", () => {
    const now = new Date("2026-06-14T12:00:00.000Z");

    it("returns hoy / ayer / hace Nd / weeks / months", () => {
        expect(formatRelativeDay("2026-06-14T08:00:00.000Z", now)).toBe("hoy");
        expect(formatRelativeDay("2026-06-13T08:00:00.000Z", now)).toBe("ayer");
        expect(formatRelativeDay("2026-06-11T12:00:00.000Z", now)).toBe(
            "hace 3d",
        );
        expect(formatRelativeDay("2026-06-01T12:00:00.000Z", now)).toBe(
            "hace 1 sem",
        );
        expect(formatRelativeDay("2026-04-01T12:00:00.000Z", now)).toBe(
            "hace 2 meses",
        );
    });

    it("returns empty string for null or unparseable", () => {
        expect(formatRelativeDay(null, now)).toBe("");
        expect(formatRelativeDay("nope", now)).toBe("");
    });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: FAIL — `formatRelativeDay` is not exported.

- [ ] **Step 7: Add `formatRelativeDay` to format.ts**

Append to `src/frontend/lib/format.ts`:

```ts
// Short Spanish relative-day label for inbox rows. `now` is injected so the
// function stays pure and unit-testable.
export function formatRelativeDay(iso: string | null, now: Date): string {
    if (!iso) {
        return "";
    }
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) {
        return "";
    }
    const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
    if (days <= 0) {
        return "hoy";
    }
    if (days === 1) {
        return "ayer";
    }
    if (days < 7) {
        return `hace ${days}d`;
    }
    if (days < 30) {
        return `hace ${Math.floor(days / 7)} sem`;
    }
    const months = Math.floor(days / 30);
    return `hace ${months} ${months > 1 ? "meses" : "mes"}`;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/frontend/lib/gmail-link.ts src/frontend/lib/gmail-link.test.ts src/frontend/lib/format.ts src/frontend/lib/format.test.ts
git commit -m "feat(bandeja): gmailMessageUrl + formatRelativeDay helpers"
```

---

## Task 7: Hooks

**Files:**
- Modify: `src/frontend/hooks/api.ts`

(No unit test — hooks are not unit-tested in this repo; verified via `pnpm check` + `pnpm build`.)

- [ ] **Step 1: Add the query + live mutation hooks**

In `src/frontend/hooks/api.ts`, add `useInbox` to the "Queries" section:

```ts
export function useInbox() {
    const api = useElysia();
    return useQuery(api.inbox.get.queryOptions());
}
```

And add `useInboxLive` to the "Mutations" section (manual trigger; the page holds the returned `unprocessed` items in state):

```ts
export function useInboxLive() {
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.api.v1.inbox.live.get();
            if (res.error) {
                throw res.error;
            }
            return res.data;
        },
    });
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm check`
Expected: PASS (Eden infers `inbox.get` / `inbox.live.get` from the mounted router).

```bash
git add src/frontend/hooks/api.ts
git commit -m "feat(bandeja): useInbox + useInboxLive hooks"
```

---

## Task 8: Add shadcn collapsible

**Files:**
- Create: `src/frontend/components/ui/collapsible.tsx` (via CLI)

Per the project's shadcn-first rule, use the registry component instead of hand-rolling a disclosure.

- [ ] **Step 1: Add the component**

Run: `pnpm dlx shadcn@latest add collapsible`
Expected: creates `src/frontend/components/ui/collapsible.tsx` (Radix wrapper) and installs `@radix-ui/react-collapsible` if missing.

- [ ] **Step 2: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/frontend/components/ui/collapsible.tsx package.json pnpm-lock.yaml
git commit -m "chore(ui): add shadcn collapsible"
```

---

## Task 9: Bandeja components

**Files:**
- Create: `src/frontend/components/bandeja/inbox-summary-banner.tsx`
- Create: `src/frontend/components/bandeja/inbox-row.tsx`
- Create: `src/frontend/components/bandeja/filtered-section.tsx`
- Create: `src/frontend/components/bandeja/refresh-from-gmail-button.tsx`
- Create: `src/frontend/components/bandeja/inbox-list.tsx`

(No unit tests — components verified via `pnpm check` + `pnpm build` + manual walk.)

- [ ] **Step 1: Summary banner**

Create `src/frontend/components/bandeja/inbox-summary-banner.tsx`:

```tsx
import type { InboxCounts } from "@/server/routers/inbox.schema";

export function InboxSummaryBanner({ counts }: { counts: InboxCounts }) {
    return (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
                De <strong className="text-foreground">{counts.total}</strong>{" "}
                correos de la bolsa, filtramos{" "}
                <strong className="text-foreground">{counts.filtrados}</strong>.
                Estas son tus{" "}
                <strong className="text-brand-strong">
                    {counts.convocatorias}
                </strong>{" "}
                convocatorias.
            </p>
        </div>
    );
}
```

- [ ] **Step 2: Inbox row**

Create `src/frontend/components/bandeja/inbox-row.tsx`:

```tsx
import { Badge } from "@/frontend/components/ui/badge";
import { cn } from "@/frontend/lib/utils";

export type InboxRowVariant = "convocatoria" | "filtrado" | "sin_procesar";

const VARIANT: Record<
    InboxRowVariant,
    { label: string; dot: string; badge: string; muted: boolean }
> = {
    convocatoria: {
        label: "Convocatoria",
        dot: "bg-emerald-600",
        badge: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
        muted: false,
    },
    filtrado: {
        label: "Filtrado",
        dot: "bg-muted-foreground/40",
        badge: "border-border bg-muted text-muted-foreground",
        muted: true,
    },
    sin_procesar: {
        label: "Sin procesar",
        dot: "bg-brand",
        badge: "border-brand/30 bg-brand/10 text-brand-strong",
        muted: false,
    },
};

export interface InboxRowProps {
    href: string;
    variant: InboxRowVariant;
    title: string;
    subtitle?: string | null;
    dateLabel: string;
}

export function InboxRow({
    href,
    variant,
    title,
    subtitle,
    dateLabel,
}: InboxRowProps) {
    const v = VARIANT[variant];
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent",
                v.muted && "opacity-70",
            )}
        >
            <span
                aria-hidden="true"
                className={cn("size-2 flex-none rounded-full", v.dot)}
            />
            <div className="min-w-0 flex-1">
                <p
                    className={cn(
                        "truncate text-sm",
                        v.muted ? "font-normal" : "font-medium",
                    )}
                >
                    {title}
                </p>
                {subtitle ? (
                    <p className="truncate text-muted-foreground text-xs">
                        {subtitle}
                    </p>
                ) : null}
            </div>
            <Badge
                variant="outline"
                className={cn("flex-none text-[10px]", v.badge)}
            >
                {v.label}
            </Badge>
            {dateLabel ? (
                <span className="flex-none text-muted-foreground text-xs tabular-nums">
                    {dateLabel}
                </span>
            ) : null}
        </a>
    );
}
```

- [ ] **Step 3: Filtered section (collapsible)**

Create `src/frontend/components/bandeja/filtered-section.tsx`:

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/frontend/components/ui/collapsible";
import { cn } from "@/frontend/lib/utils";
import type { InboxItem } from "@/server/routers/inbox.schema";
import { formatRelativeDay } from "@/frontend/lib/format";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";
import { InboxRow } from "./inbox-row";

interface FilteredSectionProps {
    items: InboxItem[];
    email: string | null;
    now: Date;
}

export function FilteredSection({ items, email, now }: FilteredSectionProps) {
    const [open, setOpen] = useState(false);
    if (items.length === 0) {
        return null;
    }
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
                <ChevronDown
                    aria-hidden="true"
                    className={cn(
                        "size-4 transition-transform",
                        open && "rotate-180",
                    )}
                />
                {open
                    ? "Ocultar filtrados"
                    : `Ver ${items.length} correos filtrados`}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
                {items.map((item) => (
                    <InboxRow
                        key={item.gmailMsgId}
                        href={gmailMessageUrl(email, item.gmailMsgId)}
                        variant="filtrado"
                        title={item.subject ?? "(sin asunto)"}
                        subtitle={item.noiseReason}
                        dateLabel={formatRelativeDay(item.date, now)}
                    />
                ))}
            </CollapsibleContent>
        </Collapsible>
    );
}
```

- [ ] **Step 4: Refresh-from-Gmail button**

Create `src/frontend/components/bandeja/refresh-from-gmail-button.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";
import { errorCode } from "@/frontend/lib/format";

interface RefreshFromGmailButtonProps {
    isPending: boolean;
    error: unknown;
    onRefresh: () => void;
}

export function RefreshFromGmailButton({
    isPending,
    error,
    onRefresh,
}: RefreshFromGmailButtonProps) {
    if (errorCode(error) === "gmail_not_connected") {
        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void requestGmailAccess()}
            >
                Reconectar Gmail
            </Button>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onRefresh}
        >
            <RefreshCw aria-hidden="true" />
            Actualizar desde Gmail
        </Button>
    );
}
```

- [ ] **Step 5: Inbox list**

Create `src/frontend/components/bandeja/inbox-list.tsx`:

```tsx
import { formatRelativeDay } from "@/frontend/lib/format";
import { gmailMessageUrl } from "@/frontend/lib/gmail-link";
import type { InboxItem, InboxLiveItem } from "@/server/routers/inbox.schema";
import { FilteredSection } from "./filtered-section";
import { InboxRow } from "./inbox-row";

interface InboxListProps {
    items: InboxItem[];
    unprocessed: InboxLiveItem[];
    email: string | null;
    now: Date;
}

export function InboxList({ items, unprocessed, email, now }: InboxListProps) {
    const convocatorias = items.filter((i) => i.kind === "convocatoria");
    const filtrados = items.filter((i) => i.kind === "filtrado");

    return (
        <div className="flex flex-col gap-3">
            {unprocessed.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {unprocessed.map((item) => (
                        <InboxRow
                            key={item.gmailMsgId}
                            href={gmailMessageUrl(email, item.gmailMsgId)}
                            variant="sin_procesar"
                            title={item.subject ?? "(sin asunto)"}
                            subtitle="Aún no sincronizada — se clasifica en la próxima sincronización"
                            dateLabel={formatRelativeDay(item.date, now)}
                        />
                    ))}
                </div>
            ) : null}

            <div className="flex flex-col gap-2">
                {convocatorias.map((item) => (
                    <InboxRow
                        key={item.gmailMsgId}
                        href={gmailMessageUrl(email, item.gmailMsgId)}
                        variant="convocatoria"
                        title={
                            item.titulo
                                ? `${item.titulo}${item.empresa ? ` · ${item.empresa}` : ""}`
                                : (item.subject ?? "(sin asunto)")
                        }
                        dateLabel={formatRelativeDay(item.date, now)}
                    />
                ))}
            </div>

            <FilteredSection items={filtrados} email={email} now={now} />
        </div>
    );
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/frontend/components/bandeja/
git commit -m "feat(bandeja): inbox components (banner, row, filtered section, refresh, list)"
```

---

## Task 10: Page + nav link + final verification

**Files:**
- Create: `src/app/(app)/bandeja/page.tsx`
- Modify: `src/frontend/components/app-nav.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(app)/bandeja/page.tsx`:

```tsx
"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/frontend/auth/auth";
import { InboxList } from "@/frontend/components/bandeja/inbox-list";
import { InboxSummaryBanner } from "@/frontend/components/bandeja/inbox-summary-banner";
import { RefreshFromGmailButton } from "@/frontend/components/bandeja/refresh-from-gmail-button";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useInbox, useInboxLive } from "@/frontend/hooks/api";
import type { InboxLiveItem } from "@/server/routers/inbox.schema";

export default function BandejaPage() {
    const inbox = useInbox();
    const live = useInboxLive();
    const session = authClient.useSession();
    const email = session.data?.user.email ?? null;
    const [now] = useState(() => new Date());
    const [unprocessed, setUnprocessed] = useState<InboxLiveItem[]>([]);

    const onRefresh = () => {
        live.mutate(undefined, {
            onSuccess: (data) => setUnprocessed(data.unprocessed),
        });
    };

    if (inbox.isPending) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
            </div>
        );
    }

    if (inbox.isError) {
        return (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
                <p className="text-destructive text-sm">
                    No pudimos cargar tu bandeja. Inténtalo de nuevo.
                </p>
                <Button type="button" onClick={() => void inbox.refetch()}>
                    Reintentar
                </Button>
            </div>
        );
    }

    const { counts, items } = inbox.data;

    if (counts.total === 0) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
                        <Inbox aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Tu bandeja está vacía
                    </EmptyTitle>
                    <EmptyDescription>
                        Sincroniza tu bolsa para ver aquí todos los correos y lo
                        que filtramos por ti.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild>
                        <Link href="/feed">Ir a sincronizar</Link>
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-serif font-bold text-foreground text-xl">
                    Bandeja de la bolsa
                </h1>
                <div className="flex items-center gap-2">
                    {live.isPending ? (
                        <Spinner className="size-4 text-muted-foreground" />
                    ) : null}
                    <RefreshFromGmailButton
                        isPending={live.isPending}
                        error={live.error}
                        onRefresh={onRefresh}
                    />
                </div>
            </div>
            <InboxSummaryBanner counts={counts} />
            <InboxList
                items={items}
                unprocessed={unprocessed}
                email={email}
                now={now}
            />
        </div>
    );
}
```

> Note: `authClient` is exported from `src/frontend/auth/auth.ts`;
> `authClient.useSession()` returns `{ data, isPending }` (see
> `src/frontend/components/require-session.tsx`), so `session.data?.user.email`
> is the signed-in email.

- [ ] **Step 2: Add the nav link**

In `src/frontend/components/app-nav.tsx`, add "Bandeja" to `navLinks`:

```ts
const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/bandeja", label: "Bandeja" },
    { href: "/digest", label: "Tu digest" },
];
```

- [ ] **Step 3: Full verification**

Run: `pnpm test`
Expected: all tests pass (existing + new schema/service/router/helper tests).

Run: `pnpm check`
Expected: PASS (biome + `tsc --noEmit`).

Run: `pnpm build`
Expected: build succeeds; `/bandeja` appears in the route output.

- [ ] **Step 4: Manual smoke (document results)**

With a synced account: open `/bandeja` → banner shows counts; convocatorias listed; "Ver N filtrados" expands with reasons; a row opens the message in Gmail; "Actualizar desde Gmail" appends any "sin procesar" rows (or shows "Reconectar Gmail" if the token is gone). Note any issues.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/bandeja/page.tsx" src/frontend/components/app-nav.tsx
git commit -m "feat(bandeja): /bandeja page + nav link"
```

---

## Self-Review notes (for the implementer)

- **Per-user isolation:** every `ingested_messages` query filters `where userId = session.user.id`; the live path uses the user's own Google token. Never widen this.
- **No raw content:** the live path fetches `format=metadata` only; never log tokens, bodies, or CV.
- **No type suppression:** no `any` / `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`. `error: unknown` and `useState<...>` are fine.
- **Zod source of truth:** all inbox shapes come from `inbox.schema.ts` via `z.infer`; no hand-written interfaces for those shapes.
- **Backfill caveat:** rows ingested before migration 0005 have null `subject`/`sender`/`internal_date`; the UI falls back to "(sin asunto)" and sorts nulls last. To repopulate, clear `ingested_messages` (regenerable) and re-sync — out of scope here.
