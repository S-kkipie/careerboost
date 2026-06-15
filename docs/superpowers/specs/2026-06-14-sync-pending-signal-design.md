# Señal de correos sin sincronizar — Design

**Date:** 2026-06-14
**Status:** Approved (pending spec review)
**Sub-project:** UX initiative — sync discoverability / re-engagement

## Problem

Sync is a manual pull. The user syncs once during onboarding; afterward nothing
signals that new bolsa emails have arrived. New convocatorias pile up in Gmail
invisibly, the user has no reason to return, and they miss matches. The user's
question: **how does the user know they should sync?**

## Decision (model)

**Manual + signal.** Keep manual sync (the existing `useSyncBolsa` ingest→match
chain). Add an ambient signal of how many bolsa emails are present in Gmail but
not yet synced, so the user knows to act. Webhooks and cron auto-sync stay out of
scope (deferred); the signal is cheap, reuses existing primitives, and answers the
question directly. A cron auto-sync can be layered on later without reworking this.

## Surfaces

Same count, two surfaces (placement option C):

- **Badge** on the "Bandeja" nav item — ambient awareness from any page.
- **Banner** on the Feed page with a direct "Sincronizar ahora" CTA — converts
  where the matches live.

Both read one shared, cached query (same react-query key → deduped). Count `0` or
Gmail-not-connected → neither surface renders.

## Data flow

```
usePendingCount() ──useQuery(staleTime 5min, refetchOnWindowFocus)──▶ GET /inbox/pending-count
                                                                         │
                          ServerConfig.ingest.senders ──▶ resolveSenders │
                          buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS)│
                          listJobMessageIds(token, query, INGEST_MAX_MESSAGES)
                          diff vs stored gmailMsgId (where userId)        │
                                                              ◀── { count } (diff length)
        ┌───────────────┴───────────────┐
   nav badge (Bandeja)           Feed banner (CTA → sync.start)
```

Sync success (`useRunIngestion.onSuccess`) invalidates the `pending-count` query →
count refetches to 0 → both surfaces disappear.

## Backend

### `src/server/services/inbox.ts` — `getPendingCount`

New function, lighter than `getUnprocessedInbox`: it counts the diff and **never
fetches per-message metadata**.

```ts
// Count of bolsa emails present in Gmail but not yet synced for this user.
// One messages.list call; no per-message fetch (unlike getUnprocessedInbox).
export async function getPendingCount(
    userId: string,
    accessToken: string,
): Promise<number> {
    const senders = resolveSenders(ServerConfig.ingest.senders);
    const query = buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS);
    const ids = await listJobMessageIds(accessToken, query, INGEST_MAX_MESSAGES);
    if (ids.length === 0) {
        return 0;
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
    return diffNewIds(ids, stored).length;
}
```

Reuses existing `resolveSenders`, `buildGmailQuery`, `listJobMessageIds`,
`diffNewIds`, `INGEST_NEWER_THAN_DAYS`, `INGEST_MAX_MESSAGES`, all already imported
in `inbox.ts`. Stored query filtered by `userId`.

### `src/server/routers/inbox.schema.ts`

```ts
export const pendingCountResponseSchema = z.object({
    count: z.number().int().nonnegative(),
});
export type PendingCountResponse = z.infer<typeof pendingCountResponseSchema>;
```

### `src/server/routers/inbox.ts` — `GET /inbox/pending-count`

Mirrors the `/live` handler's auth + Gmail-error handling, but maps a
not-connected / 401 / 403 condition to `{ count: 0 }` (hide the signal, no nag)
instead of a 400. `.parse()` stays outside the try.

```ts
.get("/pending-count", async ({ request, status }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
        return status(401, { code: "unauthenticated" });
    }
    let count = 0;
    try {
        const token = await getGoogleAccessToken(session.user.id, request.headers);
        count = await getPendingCount(session.user.id, token);
    } catch (e) {
        if (
            e instanceof GmailNotConnectedError ||
            (e instanceof GmailApiError && (e.status === 401 || e.status === 403))
        ) {
            return pendingCountResponseSchema.parse({ count: 0 });
        }
        throw e;
    }
    return pendingCountResponseSchema.parse({ count });
});
```

## Frontend

### `src/frontend/hooks/api.ts`

```ts
export function usePendingCount() {
    const api = useElysia();
    return useQuery({
        ...api.inbox["pending-count"].get.queryOptions(),
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: true,
    });
}
```

In `useRunIngestion`, extend `onSuccess` to also invalidate the pending-count key:

```ts
qc.invalidateQueries({ queryKey: api.inbox["pending-count"].get.queryKey() });
```

### `src/frontend/components/app-nav.tsx` — badge

Call `usePendingCount()`; when `data.count > 0`, render a count badge on the
"Bandeja" link. Uses design tokens (`bg-brand` / `text-brand-foreground` or the
`success` token), **not** a hardcoded red — follows repo convention. The nav is
already `"use client"`; the hook query is shared/deduped with the Feed banner.

### `src/frontend/components/feed/sync-pending-banner.tsx` (new)

```tsx
interface SyncPendingBannerProps {
    count: number;
    onSync: () => void;
}
```

Renders a `Mail` (lucide) icon + count copy + a "Sincronizar ahora" button wired
to `onSync`. No emoji (repo rule). Non-dismissable — it is count-driven and clears
the moment the user syncs.

### `src/app/(app)/feed/page.tsx` — wire-in

Add `const pending = usePendingCount();` in `FeedInner`. In the normal feed return
(the branch that already has synced; `hasRun` true and not syncing), render
`<SyncPendingBanner>` above `<ImpactPanel>` when `(pending.data?.count ?? 0) > 0`.
The early branches (`sync.isRunning`, `sync.stage === "error"`, never-synced
`SyncCta`) are untouched — the banner never competes with the first-run CTA.

## Copy (es)

- Badge: the number (e.g. `3`).
- Banner, plural: "Tienes **{count}** correos nuevos en tu bolsa".
- Banner, singular (`count === 1`): "Tienes **1** correo nuevo en tu bolsa".
- Banner CTA button: "Sincronizar ahora".

## Security / isolation

- All queries scoped by `session.user.id`; never a client-supplied id.
- Gmail scope stays `readonly`; only `messages.list` is called — no bodies, no
  metadata fetched for the count path.
- No tokens, CV, or email content logged.

## Edge cases

- count `0` → no badge, no banner.
- Gmail not connected → endpoint returns `{ count: 0 }` → signal hidden (reconnect
  is handled by the existing bandeja flow, not nagged here).
- Pre-first-sync → `hasRun` is false → Feed shows `SyncCta`, banner gated off.
- Mid-sync → `sync.isRunning` branch renders `SyncProgress`; banner not shown.

## Testing

- **`getPendingCount`** (`src/server/services/inbox.test.ts`): mock
  `listJobMessageIds` to return ids; seed/mock stored rows as a subset; assert
  count equals the diff length. Empty list → 0. Mirror the existing
  `getUnprocessedInbox` test setup.
- **Router** (`src/server/routers/inbox.test.ts`): not-connected →
  `{ count: 0 }`; no session → 401. Mirror the `/live` tests.
- **Schema** (`src/server/routers/inbox.schema.test.ts`):
  `pendingCountResponseSchema` accepts `{count: 0}`, rejects negative / non-int.
- **Banner**: pure render gate — not rendered when count is 0; rendered with copy
  when count > 0 (singular vs plural). (Vitest node env; keep logic-only.)

## Out of scope

- Cron / webhook auto-sync (deferred; future model C).
- Push / email notification of new bolsa mail.
- Dismiss / snooze of the banner.
