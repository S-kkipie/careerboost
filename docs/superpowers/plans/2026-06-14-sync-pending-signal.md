# Sync Pending-Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface how many bolsa emails are in Gmail but not yet synced, as a nav badge + a Feed banner with a "Sincronizar ahora" CTA, so the user knows when to sync.

**Architecture:** A lightweight `GET /inbox/pending-count` endpoint diffs Gmail-listed bolsa message ids against the user's already-stored ids and returns just the count (no per-message fetch). One cached react-query (`usePendingCount`, staleTime 5 min, refetch on focus) feeds both surfaces; a successful ingestion invalidates it so the signal clears.

**Tech Stack:** Elysia + Eden Treaty, Zod 4 (schema source of truth, types via `z.infer`), Drizzle ORM, TanStack Query, Next.js App Router + React 19, shadcn/ui, lucide-react, Vitest (node env, pure-function tests only — no mocks, no DOM).

**Conventions (must follow):**
- Per-user isolation: every query scoped by `session.user.id`, never a client-supplied id.
- Gmail scope `readonly`; this feature only calls `messages.list` — never fetches bodies/metadata.
- Never log tokens, CV, or email content.
- No type suppression (`any`/`as any`/`as unknown as`/`@ts-ignore`/`@ts-expect-error`). `error: unknown` is fine.
- New shapes are Zod-first; derive types via `z.infer`.
- Commit messages end with the `Co-Authored-By` trailer shown in each commit step.
- Tests are pure-function only — the repo has **zero** `vi.mock`/`vi.fn`/`vi.spyOn`. Do not introduce mocking. DB/Gmail-bound functions are verified by typecheck + their extracted pure helpers (which already have tests), not unit-mocked.

**Verification commands:**
- Single test file: `pnpm test <path>`
- Full suite: `pnpm test` (= `vitest run`)
- Types + lint: `pnpm check` (= `biome check . && tsc --noEmit`)
- Production build: `pnpm build`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/server/routers/inbox.schema.ts` | Zod `pendingCountResponseSchema` + type | Modify |
| `src/server/routers/inbox.schema.test.ts` | Schema parse tests | Modify |
| `src/server/services/inbox.ts` | `getPendingCount(userId, token)` service | Modify |
| `src/server/routers/inbox.ts` | `GET /inbox/pending-count` handler | Modify |
| `src/server/routers/inbox.test.ts` | Router auth-gate test | Modify |
| `src/frontend/lib/format.ts` | `pendingCountLabel(count)` pure copy helper | Modify |
| `src/frontend/lib/format.test.ts` | Copy helper tests | Modify |
| `src/frontend/hooks/api.ts` | `usePendingCount()` + ingestion invalidation | Modify |
| `src/frontend/components/feed/sync-pending-banner.tsx` | Feed banner UI | Create |
| `src/frontend/components/app-nav.tsx` | Bandeja nav badge | Modify |
| `src/app/(app)/feed/page.tsx` | Wire banner into Feed | Modify |

---

### Task 1: pending-count Zod schema

**Files:**
- Modify: `src/server/routers/inbox.schema.ts` (append after line 41, before the type exports block)
- Test: `src/server/routers/inbox.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/server/routers/inbox.schema.test.ts`. Also add `pendingCountResponseSchema` to the existing import at the top of the file:

```ts
import {
    inboxLiveResponseSchema,
    inboxResponseSchema,
    pendingCountResponseSchema,
} from "@/server/routers/inbox.schema";
```

```ts
describe("pendingCountResponseSchema", () => {
    it("accepts a non-negative integer count", () => {
        expect(pendingCountResponseSchema.parse({ count: 0 })).toEqual({
            count: 0,
        });
        expect(pendingCountResponseSchema.parse({ count: 5 })).toEqual({
            count: 5,
        });
    });

    it("rejects a negative count", () => {
        expect(() => pendingCountResponseSchema.parse({ count: -1 })).toThrow();
    });

    it("rejects a non-integer count", () => {
        expect(() => pendingCountResponseSchema.parse({ count: 1.5 })).toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/routers/inbox.schema.test.ts`
Expected: FAIL — `pendingCountResponseSchema` is not exported (import error / undefined).

- [ ] **Step 3: Add the schema**

In `src/server/routers/inbox.schema.ts`, immediately after the `inboxLiveResponseSchema` block (line 41) and before `export type InboxKind = ...`:

```ts
export const pendingCountResponseSchema = z.object({
    count: z.number().int().nonnegative(),
});
```

Then add its type export alongside the others (after `export type InboxLiveResponse = ...`):

```ts
export type PendingCountResponse = z.infer<typeof pendingCountResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/routers/inbox.schema.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/inbox.schema.ts src/server/routers/inbox.schema.test.ts
git commit -m "$(cat <<'EOF'
feat(inbox): pendingCountResponseSchema (Zod source of truth)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `getPendingCount` service

**Files:**
- Modify: `src/server/services/inbox.ts` (append after `getUnprocessedInbox`, end of file)

**Note on testing:** The only new logic is `diffNewIds(...).length`; `diffNewIds` is already unit-tested in `src/server/services/inbox.test.ts`. The rest is Gmail + DB I/O, which the repo does not unit-test (e.g. `getUnprocessedInbox` has no test) and does not mock. Verify this task by typecheck + the existing suite staying green. Do not add a mock-based test.

- [ ] **Step 1: Add the function**

All needed imports (`and`, `eq`, `inArray`, `db`, `ingestedMessages`, `ServerConfig`, `resolveSenders`, `buildGmailQuery`, `listJobMessageIds`, `INGEST_NEWER_THAN_DAYS`, `INGEST_MAX_MESSAGES`, `diffNewIds`) are already present in `inbox.ts`. Append at the end of the file:

```ts
// Count of bolsa emails present in Gmail but not yet synced for this user.
// Lighter than getUnprocessedInbox: one messages.list call, then diff against
// stored ids — no per-message metadata fetch.
export async function getPendingCount(
    userId: string,
    accessToken: string,
): Promise<number> {
    const senders = resolveSenders(ServerConfig.ingest.senders);
    const query = buildGmailQuery(senders, INGEST_NEWER_THAN_DAYS);
    const ids = await listJobMessageIds(
        accessToken,
        query,
        INGEST_MAX_MESSAGES,
    );
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

- [ ] **Step 2: Verify types + existing tests**

Run: `pnpm check`
Expected: PASS (no type errors, biome clean).

Run: `pnpm test src/server/services/inbox.test.ts`
Expected: PASS (existing `diffNewIds` / `mapInboxRow` tests still green).

- [ ] **Step 3: Commit**

```bash
git add src/server/services/inbox.ts
git commit -m "$(cat <<'EOF'
feat(inbox): getPendingCount service (diff-only, no metadata fetch)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `GET /inbox/pending-count` endpoint

**Files:**
- Modify: `src/server/routers/inbox.ts` (extend imports; append a `.get` to the chain after `/live`)
- Test: `src/server/routers/inbox.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/server/routers/inbox.test.ts` inside the existing `describe("/api/v1/inbox (auth gating)", ...)` block:

```ts
    it("GET /inbox/pending-count returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/inbox/pending-count"),
        );
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "unauthenticated" });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/routers/inbox.test.ts`
Expected: FAIL — route does not exist yet, so the request 404s instead of returning 401.

- [ ] **Step 3: Implement the endpoint**

In `src/server/routers/inbox.ts`, extend the two imports:

```ts
import { getPendingCount, getStoredInbox, getUnprocessedInbox } from "@/server/services/inbox";
import {
    type InboxLiveItem,
    inboxLiveResponseSchema,
    inboxResponseSchema,
    pendingCountResponseSchema,
} from "./inbox.schema";
```

Then append this `.get` to the chain, immediately after the `/live` handler (after its closing `});`, before the final `;`):

```ts
    .get("/pending-count", async ({ request, status }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
            return status(401, { code: "unauthenticated" });
        }
        // Gmail-not-connected (or a 401/403 from Gmail) means "no signal to
        // show" — return 0 rather than an error so the badge/banner just hide.
        let count = 0;
        try {
            const token = await getGoogleAccessToken(
                session.user.id,
                request.headers,
            );
            count = await getPendingCount(session.user.id, token);
        } catch (e) {
            if (
                e instanceof GmailNotConnectedError ||
                (e instanceof GmailApiError &&
                    (e.status === 401 || e.status === 403))
            ) {
                return pendingCountResponseSchema.parse({ count: 0 });
            }
            throw e;
        }
        return pendingCountResponseSchema.parse({ count });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/routers/inbox.test.ts`
Expected: PASS (all three auth-gate cases green).

- [ ] **Step 5: Verify types**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/inbox.ts src/server/routers/inbox.test.ts
git commit -m "$(cat <<'EOF'
feat(inbox): GET /inbox/pending-count endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `pendingCountLabel` copy helper

**Files:**
- Modify: `src/frontend/lib/format.ts` (append at end of file)
- Test: `src/frontend/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

Add `pendingCountLabel` to the existing import in `src/frontend/lib/format.test.ts`, then append:

```ts
describe("pendingCountLabel", () => {
    it("uses the singular noun for exactly 1", () => {
        expect(pendingCountLabel(1)).toBe("Tienes 1 correo nuevo en tu bolsa");
    });

    it("uses the plural noun otherwise", () => {
        expect(pendingCountLabel(3)).toBe(
            "Tienes 3 correos nuevos en tu bolsa",
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: FAIL — `pendingCountLabel` not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/frontend/lib/format.ts`:

```ts
// Banner copy for the pending-sync signal; singular vs plural noun.
export function pendingCountLabel(count: number): string {
    const noun = count === 1 ? "correo nuevo" : "correos nuevos";
    return `Tienes ${count} ${noun} en tu bolsa`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/frontend/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/lib/format.ts src/frontend/lib/format.test.ts
git commit -m "$(cat <<'EOF'
feat(format): pendingCountLabel singular/plural copy helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `usePendingCount` hook + ingestion invalidation

**Files:**
- Modify: `src/frontend/hooks/api.ts` (add query hook in the Queries section; extend `useRunIngestion.onSuccess`)

**Note:** Hooks are not unit-tested in this repo (no DOM runner). Verify by typecheck. The `api.inbox["pending-count"]` accessor and its return type flow from Task 3's endpoint via Eden Treaty — Task 3 must be complete first.

- [ ] **Step 1: Add the query hook**

In `src/frontend/hooks/api.ts`, in the `// --- Queries ---` section (e.g. right after `useInbox`), add:

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

- [ ] **Step 2: Invalidate pending-count after a sync**

In the same file, in `useRunIngestion`, extend `onSuccess` to also invalidate the pending-count query (so the signal clears once the user syncs):

```ts
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: api.ingest.last.get.queryKey(),
            });
            qc.invalidateQueries({
                queryKey: api.inbox["pending-count"].get.queryKey(),
            });
        },
```

- [ ] **Step 3: Verify types + full suite**

Run: `pnpm check`
Expected: PASS (Eden infers `{ count: number }` from the endpoint).

Run: `pnpm test`
Expected: PASS (all existing tests green).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/hooks/api.ts
git commit -m "$(cat <<'EOF'
feat(hooks): usePendingCount + invalidate on ingestion success

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `SyncPendingBanner` component

**Files:**
- Create: `src/frontend/components/feed/sync-pending-banner.tsx`

**Note:** Component is not render-tested (no DOM runner). Its copy logic lives in the already-tested `pendingCountLabel`. Verify by typecheck.

- [ ] **Step 1: Create the component**

Create `src/frontend/components/feed/sync-pending-banner.tsx`:

```tsx
"use client";

import { Mail } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { pendingCountLabel } from "@/frontend/lib/format";

interface SyncPendingBannerProps {
    count: number;
    onSync: () => void;
}

export function SyncPendingBanner({ count, onSync }: SyncPendingBannerProps) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3">
            <Mail
                aria-hidden="true"
                className="size-5 flex-none text-brand-strong"
            />
            <p className="flex-1 text-foreground text-sm">
                {pendingCountLabel(count)}
            </p>
            <Button
                type="button"
                size="sm"
                onClick={onSync}
                className="flex-none"
            >
                Sincronizar ahora
            </Button>
        </div>
    );
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/components/feed/sync-pending-banner.tsx
git commit -m "$(cat <<'EOF'
feat(feed): SyncPendingBanner component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Bandeja nav badge

**Files:**
- Modify: `src/frontend/components/app-nav.tsx` (full replacement below)

**Note:** Verify by typecheck + build. The badge uses design tokens (`bg-brand` / `text-brand-foreground`), not a hardcoded color — repo convention.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `src/frontend/components/app-nav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@/frontend/components/auth/user/user-button";
import { ThemeToggle } from "@/frontend/components/theme-toggle";
import { usePendingCount } from "@/frontend/hooks/api";
import { cn } from "@/frontend/lib/utils";

const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/bandeja", label: "Bandeja" },
    { href: "/digest", label: "Tu digest" },
];

export function AppNav() {
    const pathname = usePathname();
    const pending = usePendingCount();
    const count = pending.data?.count ?? 0;

    return (
        <header className="border-b bg-card">
            <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                <Link
                    href="/feed"
                    className="font-serif font-bold text-foreground"
                >
                    Career<span className="text-brand">Boost</span>
                </Link>
                <div className="flex items-center gap-1">
                    {navLinks.map((link) => {
                        const active = pathname === link.href;
                        const showBadge = link.href === "/bandeja" && count > 0;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                                    active
                                        ? "text-brand-strong"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {link.label}
                                {showBadge ? (
                                    <span
                                        aria-label={`${count} correos sin sincronizar`}
                                        className="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 font-semibold text-[10px] text-brand-foreground tabular-nums"
                                    >
                                        {count > 9 ? "9+" : count}
                                    </span>
                                ) : null}
                            </Link>
                        );
                    })}
                    <ThemeToggle />
                    <UserButton
                        size="icon"
                        links={[
                            { label: "Tu perfil", href: "/perfil" },
                            { label: "Tu digest", href: "/digest" },
                        ]}
                    />
                </div>
            </nav>
        </header>
    );
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/components/app-nav.tsx
git commit -m "$(cat <<'EOF'
feat(nav): pending-sync badge on Bandeja link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire banner into Feed

**Files:**
- Modify: `src/app/(app)/feed/page.tsx`

**Note:** The banner only renders in the normal (already-synced) feed branch. The earlier branches (`sync.isRunning` → `SyncProgress`, `sync.stage === "error"` → `SyncError`, never-synced → `SyncCta`) are untouched, so the banner never competes with the first-run CTA or the progress view.

- [ ] **Step 1: Add imports**

In `src/app/(app)/feed/page.tsx`, add the banner import (alongside the other feed-component imports):

```tsx
import { SyncPendingBanner } from "@/frontend/components/feed/sync-pending-banner";
```

And extend the hooks import to include `usePendingCount`:

```tsx
import {
    useFeed,
    useLastIngestion,
    usePendingCount,
    useSetMatchStatus,
} from "@/frontend/hooks/api";
```

- [ ] **Step 2: Read the pending count in `FeedInner`**

Just after `const setStatus = useSetMatchStatus();`, add:

```tsx
    const pending = usePendingCount();
    const pendingCount = pending.data?.count ?? 0;
```

- [ ] **Step 3: Render the banner in the normal return**

In the final `return (...)` of `FeedInner`, insert the banner between the "Sincronizar ahora" button row and `<ImpactPanel>`:

```tsx
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={sync.start}
                >
                    <RefreshCw aria-hidden="true" />
                    Sincronizar ahora
                </Button>
            </div>
            {pendingCount > 0 ? (
                <SyncPendingBanner count={pendingCount} onSync={sync.start} />
            ) : null}
            <ImpactPanel
                run={ingestion.data?.run ?? null}
                isLoading={ingestion.isPending}
            />
            <FiltersBar
                soloConSalario={soloConSalario === "true"}
                modalidad={modalidad}
                ubicacion={ubicacion}
                onSoloConSalarioChange={(v) =>
                    setSoloConSalario(v ? "true" : "")
                }
                onModalidadChange={setModalidad}
                onUbicacionChange={setUbicacion}
            />
            {feedSection}
        </div>
    );
```

- [ ] **Step 4: Verify types, full suite, and build**

Run: `pnpm check`
Expected: PASS.

Run: `pnpm test`
Expected: PASS (full suite green).

Run: `pnpm build`
Expected: build succeeds (no type / prerender errors).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/feed/page.tsx"
git commit -m "$(cat <<'EOF'
feat(feed): show SyncPendingBanner when bolsa has unsynced mail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

After all tasks:

- [ ] `pnpm test` — full suite green
- [ ] `pnpm check` — types + lint clean
- [ ] `pnpm build` — production build succeeds
- [ ] Manual smoke (if a working DB/Gmail session is available): with unsynced bolsa mail present, the Bandeja nav badge shows the count and the Feed shows the banner; clicking "Sincronizar ahora" runs the ingest→match chain and both the badge and banner disappear afterward.
