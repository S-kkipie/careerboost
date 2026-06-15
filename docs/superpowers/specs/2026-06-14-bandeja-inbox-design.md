# Bandeja de Entrada (Inbox Panel) — Design

**Date:** 2026-06-14
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** Frontend (new `/bandeja` page + components) + one read endpoint group + one small migration.

## Goal

Give the user a transparent, inbox-style view of **every** email that arrived from the UNSA
bolsa de trabajo sender(s), so it is visually obvious that the app **is filtering**: real
convocatorias are surfaced as the primary content, and the volume of filtered-out noise is made
explicit. Clicking any row opens that exact message in Gmail.

This is sub-project 2 of the larger UX initiative (after unified onboarding). Out of scope here
(separate specs): Gmail webhooks, landing/pages visual polish.

## Chosen direction

- **Layout A — Resumen + lista limpia** (selected by the user in the visual companion): a summary
  banner with the counts on top ("De N correos filtramos X. Estas son tus Y convocatorias."),
  then the list of convocatorias as the primary content, then a collapsible "Ver X filtrados"
  section that reveals the noise rows with their reason.
- **Hybrid data source** (stored + live): the saved list (DB) renders instantly with the already
  classified convocatorias/filtrados; a manual **"Actualizar desde Gmail"** action does a live
  `messages.list` and surfaces emails that arrived but have **not been synced yet** as
  **"sin procesar"** rows (they get classified on the next normal sync in `/feed`).

## Background — current state

- **`ingested_messages`** (`src/server/drizzle/schemas/ingested-messages.ts`): per-user log of
  processed Gmail messages — `{ id, userId, gmailMsgId, jobId?, noiseReason?, createdAt }`.
  Unique on `(userId, gmailMsgId)`, index on `userId`. `jobId` set ⇒ the message became a
  convocatoria in the global `jobs` pool; `jobId` null + `noiseReason` ⇒ classified as noise.
  **It does not store the email subject/sender/date**, so it cannot render an inbox as-is.
- **`jobs`** (`src/server/drizzle/schemas/jobs.ts`): shared global pool — `titulo`, `empresa`,
  `applyLink`, `deadline`, `modalidad`, etc. Linked per-user via `ingested_messages.jobId`.
- **Gmail client** (`src/server/services/gmail.ts`): `ParsedGmailMessage` =
  `{ id, sender, subject, date, text }`. `listJobMessageIds(token, query, max)` lists ids;
  `getMessage(token, id)` fetches one (currently `format=full`). `buildGmailQuery(senders, days)`
  builds `from:(...) newer_than:Nd`. `resolveSenders`, `INGEST_NEWER_THAN_DAYS=30`,
  `INGEST_MAX_MESSAGES=50`, `GmailNotConnectedError`, `getGoogleAccessToken(userId, headers)`.
- **Ingestion** (`src/server/services/ingestion.ts`): `recordIngestedMessage({ userId,
  gmailMsgId, jobId, noiseReason })` upserts with `onConflictDoNothing`. `runIngestion` lists
  ids, skips already-ingested via `existingMsgIds`, classifies + extracts + records.
- **Guards / shell**: `RequireSession` → `RequireOnboarded` wrap the `(app)` group
  (`src/app/(app)/layout.tsx`). `AppNav` (`src/frontend/components/app-nav.tsx`) holds the nav
  links. Pages live under `src/app/(app)/`.
- **Hooks** (`src/frontend/hooks/api.ts`): queries via the eden-tanstack proxy, mutations via raw
  `apiClient`; `errorMessage()` maps codes to Spanish; `requestGmailAccess()` in
  `src/frontend/auth/gmail.ts`.

## Architecture decision

**Read-only, mostly-frontend, hybrid.** No new write paths, no run orchestration. One new read
endpoint group (`/api/v1/inbox`) and one small migration to make the inbox renderable from stored
data. The "live" freshness is a single cheap `messages.list` plus header-only fetches **only for
ids not already stored** (typically the few emails that arrived since the last sync) — bounded
cost, never re-classifies.

**Per-user isolation** stays strict: every query filters `where userId = session.user.id`; the
live fetch uses the user's own Google token. Convocatoria *content* comes from the shared global
`jobs` pool (public convocatorias), but **which messages a user received** is per-user via
`ingested_messages`.

## Data model — migration 0005

Add three nullable columns to `ingested_messages` to carry display metadata captured at sync time:

```ts
subject: text("subject"),
sender: text("sender"),
internalDate: timestamp("internal_date"),
```

- Filled by `recordIngestedMessage` going forward (both the job and the noise branches pass the
  parsed `msg.subject` / `msg.sender` / `toDate(msg.date)`).
- **Backfill caveat:** rows written before this migration have null metadata, and normal re-sync
  skips already-ingested ids, so it will not backfill them. `ingested_messages` is regenerable
  (jobs/matches were already reset in the shared-jobs-pool migration 0004); to repopulate, clear
  `ingested_messages` for the user and re-sync. The UI must tolerate null metadata gracefully
  (fallback subject "(sin asunto)"). No backfill script is in scope.
- `recordIngestedMessage` keeps `onConflictDoNothing` (idempotent; metadata is only ever written
  on first insert, which is when we have the parsed message in hand).

`internalDate` is derived from the Gmail `Date` header via a small `toDate(headerDate): Date | null`
helper (mirrors the existing `toIsoDate`).

## Endpoints — `/api/v1/inbox`

New Elysia router `src/server/routers/inbox.ts` mounted under `/api/v1`, session-guarded like the
other v1 routers (resolves `session.user.id`).

### Schemas — Zod is the source of truth

All inbox shapes are defined as **Zod schemas** with types derived via **`z.infer`** — no
hand-written `interface`/`type` literals. This matches the project convention already used in
`src/server/ai/*` and `src/config/env.ts` (`zod ^4`). Elysia **1.4.28** + Zod **4** support
[Standard Schema](https://standardschema.dev), so the Zod schemas are passed **directly** into the
Elysia route validators (`response`, `query`); Eden Treaty then infers the frontend types from the
route definitions, keeping a single source of truth end-to-end. (The older routers use TypeBox
`t`; this feature intentionally uses Zod per the source-of-truth rule.)

Schema module: `src/server/routers/inbox.schema.ts`.

```ts
import { z } from "zod";

export const inboxKindSchema = z.enum(["convocatoria", "filtrado"]);

export const inboxItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(),        // ISO string from internal_date, or null
    kind: inboxKindSchema,
    noiseReason: z.string().nullable(), // set when kind === "filtrado"
    jobId: z.string().nullable(),       // set when kind === "convocatoria"
    titulo: z.string().nullable(),      // from joined jobs row (convocatoria)
    empresa: z.string().nullable(),     // from joined jobs row (convocatoria)
});

export const inboxCountsSchema = z.object({
    total: z.number(),
    convocatorias: z.number(),
    filtrados: z.number(),
});

export const inboxResponseSchema = z.object({
    counts: inboxCountsSchema,
    items: z.array(inboxItemSchema),    // internal_date desc, nulls last; capped at 100
});

export type InboxKind = z.infer<typeof inboxKindSchema>;
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;
```

### `GET /api/v1/inbox` — stored list (instant)

Reads from the DB only. Returns the saved, already-classified messages for the user, validated
against `inboxResponseSchema`:

- `response: inboxResponseSchema` on the Elysia route.

- Query: `ingested_messages` `LEFT JOIN jobs ON ingested_messages.job_id = jobs.id`,
  `WHERE ingested_messages.user_id = ?`, `ORDER BY internal_date DESC NULLS LAST`, `LIMIT 100`.
- `kind` = `jobId != null ? "convocatoria" : "filtrado"`.
- `counts` derived from the same user's rows (`total` = all, `convocatorias` = jobId not null,
  `filtrados` = jobId null). Computed with a small aggregate query so the banner reflects the full
  set even though `items` is capped.

### `GET /api/v1/inbox/live` — unprocessed (live diff)

Live freshness. Lists the current Gmail message ids for the bolsa senders (same query as ingest:
`buildGmailQuery(resolveSenders(...), INGEST_NEWER_THAN_DAYS)`, cap `INGEST_MAX_MESSAGES`), diffs
against the user's stored `gmailMsgId`s, and fetches **headers only** for the missing ids.
Validated against `inboxLiveResponseSchema` (also in `inbox.schema.ts`, Zod source of truth):

```ts
export const inboxLiveItemSchema = z.object({
    gmailMsgId: z.string(),
    subject: z.string().nullable(),
    sender: z.string().nullable(),
    date: z.string().nullable(),
});

export const inboxLiveResponseSchema = z.object({
    unprocessed: z.array(inboxLiveItemSchema),
});

export type InboxLiveItem = z.infer<typeof inboxLiveItemSchema>;
export type InboxLiveResponse = z.infer<typeof inboxLiveResponseSchema>;
```

- Requires a new lightweight Gmail helper `getMessageMetadata(token, id)` that fetches with
  `format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date` — **no body
  is ever fetched here** (lighter, and avoids touching message content for a transparency view).
- On `GmailNotConnectedError` → respond `401`/error code `gmail_not_connected` (reuse existing
  mapping). Any other Gmail error → error code `gmail_error`; the frontend keeps the stored list
  and toasts.
- Bounded cost: one `messages.list` + one metadata fetch per *new* id only.

## UI — `/bandeja`

New route `src/app/(app)/bandeja/page.tsx` inside the `(app)` group (inherits
`RequireSession` + `RequireOnboarded`). Add a "Bandeja" link to `AppNav` between Feed and Perfil.

**Components** (`src/frontend/components/bandeja/`):

- `InboxSummaryBanner` — the count banner. "De **{total}** correos de la bolsa, filtramos
  **{filtrados}**. Estas son tus **{convocatorias}** convocatorias." Uses the brand/warm banner
  styling (shadcn primitives; matches the Layout A mockup).
- `InboxList` — renders the convocatoria rows (primary), then the `FilteredSection`, then any
  `sin_procesar` rows appended after a live refresh.
- `InboxRow` — one row: status dot/badge, subject (or `titulo · empresa` for convocatorias),
  relative/short date. Entire row is a link that opens the message in Gmail in a new tab
  (`target="_blank" rel="noopener noreferrer"`). Three visual variants: `convocatoria`
  (prominent), `filtrado` (muted, shows `noiseReason`), `sin_procesar` (neutral, "sin procesar").
- `FilteredSection` — collapsible "Ver {filtrados} filtrados" / "Ocultar filtrados"; collapsed by
  default. Renders filtered `InboxRow`s. Uses a shadcn collapsible/disclosure primitive.
- `RefreshFromGmailButton` — triggers the live fetch; shows a spinner while loading; on success
  appends `sin_procesar` rows; on `gmail_not_connected` swaps to a "Reconectar Gmail" action
  (`requestGmailAccess()`); other errors → sonner toast, stored list intact.

**States:**
1. **Loading** (stored query pending) → skeleton rows.
2. **Never synced** (counts.total === 0, no run) → empty state: explain the bandeja fills after the
   first sync, with a CTA/link to `/feed` to sync. (Does not run sync itself.)
3. **Populated** → banner + convocatorias + collapsible filtrados + refresh button.
4. **Query error** → inline retry (refetch), consistent with `RequireOnboarded`'s error branch.

**Hooks** (add to `src/frontend/hooks/api.ts`):
- `useInbox()` → `GET /inbox` (query).
- `useInboxLive()` → manual/lazy fetch of `GET /inbox/live` (mutation-style or `enabled:false`
  query triggered by the button); exposes loading/error + the `unprocessed` items.
- Frontend types come from Eden Treaty inference off the Zod-validated routes (or by importing the
  `z.infer` types from `inbox.schema.ts`) — components define **no** separate interfaces.

## Deep-link to Gmail

Pure helper `src/frontend/lib/gmail-link.ts`:

```ts
export function gmailMessageUrl(email: string, gmailMsgId: string): string {
    // Opens the exact message in Gmail web. authuser disambiguates multi-account;
    // the API message id is valid in the #all/<id> fragment.
    const account = encodeURIComponent(email);
    return `https://mail.google.com/mail/?authuser=${account}#all/${gmailMsgId}`;
}
```

- The signed-in email comes from the Better Auth session (`authClient.useSession()` /
  `session.user.email`). If unavailable, fall back to `https://mail.google.com/mail/u/0/#all/<id>`.
- Opened via a normal anchor (`<a href target="_blank">`), not JS navigation — keeps it a real,
  middle-click-able link.

## Error handling

- **No sync yet** → empty state pointing to `/feed` (above).
- **Live refresh, Gmail not connected** → button becomes "Reconectar Gmail" → `requestGmailAccess()`.
- **Live refresh, other Gmail error** → toast via `errorMessage`; stored list untouched.
- **Stored query error** → inline retry.
- All existing constraints hold: never log tokens / CV / raw bodies; `gmail.readonly` unchanged;
  the live path uses `format=metadata` (headers only, no body); per-user isolation enforced
  server-side (`where userId = session.user.id`).

## Testing

- **Pure units** (vitest, node env):
  - `gmailMessageUrl(email, id)` — builds the expected URL; encodes the email; fallback form.
  - `toDate(headerDate)` — valid header → Date; invalid/null → null.
  - inbox mapping helper (rows → `kind` + counts) if extracted as a pure function.
- **Endpoint tests** where they fit the existing service-test style (the stored `GET /inbox`
  query mapping; the live diff logic with the Gmail client mocked). Follow the existing
  ingestion/matching test patterns. The Zod `response` schemas validate route output at runtime
  (Standard Schema), so a mapping that drifts from the schema fails fast.
- No DOM test runner — page + components verified via `pnpm check` (biome + `tsc --noEmit`) +
  `pnpm build` + a manual walk (consistent with specs 06/07, shared-jobs-pool, unified-onboarding).
- All existing tests stay green.

## Out of scope (YAGNI)

- Re-classifying or running sync from the bandeja (live only lists; classification stays in the
  normal `/feed` sync).
- Backfilling metadata for pre-migration `ingested_messages` rows (regenerable; documented caveat).
- Pagination/infinite scroll beyond the 100-row cap (counts still reflect the full set).
- Marking read/unread, archiving, or any write-back to Gmail (read-only by design).
- Gmail webhooks, landing/pages polish (separate sub-projects).
