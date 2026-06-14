# Unified Onboarding + First Sync in Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn account setup into a once-only full-screen wizard (Connect Gmail → Upload CV → feed), and move the slow `ingest → match` run into the feed behind a large manual button with staged progress.

**Architecture:** Client-orchestrated, no new endpoints and no migration. A route guard derives "onboarded" from `hasProfile`. A new `useSyncBolsa` hook chains the existing ingestion + matching mutations and exposes a stage for staged (non-streamed) progress; the feed renders CTA / progress / error / populated states. Pure helpers (stage label + redirect policy) are unit-tested; React UI is verified via `pnpm check` + `pnpm build` (no DOM test runner, consistent with specs 06/07).

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Eden Treaty hooks, shadcn/ui, lucide-react, Vitest, Biome.

---

## File Structure

- `src/frontend/lib/onboarding.ts` (Create) — pure helpers: `SyncStage`, `syncStageLabel`, `shouldRedirectToOnboarding`, `shouldRedirectToFeed`. No React.
- `src/frontend/lib/onboarding.test.ts` (Create) — unit tests for the helpers.
- `src/frontend/hooks/use-sync-bolsa.ts` (Create) — `useSyncBolsa()` orchestrates ingest→match with a stage machine.
- `src/frontend/components/require-onboarded.tsx` (Create) — client guard redirecting profile-less users to `/onboarding`.
- `src/app/(app)/layout.tsx` (Modify) — nest `RequireOnboarded` inside `RequireSession`.
- `src/frontend/components/onboarding/connect-gmail-step.tsx` (Create) — Gmail step UI.
- `src/frontend/components/onboarding/upload-cv-step.tsx` (Create) — CV dropzone step UI (ported from current page).
- `src/frontend/components/onboarding/onboarding-wizard.tsx` (Create) — wizard shell: progress + active step + completion redirect.
- `src/app/onboarding/page.tsx` (Modify) — render the wizard.
- `src/frontend/components/feed/sync-cta.tsx` (Create) — large first-run CTA.
- `src/frontend/components/feed/sync-progress.tsx` (Create) — staged progress UI.
- `src/frontend/components/feed/sync-error.tsx` (Create) — sync error UI with retry / reconnect.
- `src/app/(app)/feed/page.tsx` (Modify) — wire CTA / progress / error / populated states + re-sync button.

Reused as-is: `requestGmailAccess` (`src/frontend/auth/gmail.ts`), hooks `useMe`/`useProfile`/`useUploadCv`/`useRunIngestion`/`useRunMatching`/`useLastIngestion`/`useFeed`/`useSetMatchStatus` (`src/frontend/hooks/api.ts`), `errorMessage`/`errorCode` (`src/frontend/lib/format.ts`), `Stepper` (`src/frontend/components/onboarding/stepper.tsx`), `Empty*` (`src/frontend/components/ui/empty.tsx`), `ImpactPanel`, `FiltersBar`, `MatchCard`, `Spinner`, `Button`, `Card`.

---

### Task 1: Pure helpers (stage label + redirect policy)

**Files:**
- Create: `src/frontend/lib/onboarding.ts`
- Test: `src/frontend/lib/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/lib/onboarding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    shouldRedirectToFeed,
    shouldRedirectToOnboarding,
    type SyncStage,
    syncStageLabel,
} from "@/frontend/lib/onboarding";

describe("syncStageLabel", () => {
    it("labels the ingest stage", () => {
        expect(syncStageLabel("ingesting")).toBe(
            "Escaneando tu bolsa y analizando con IA…",
        );
    });
    it("labels the match stage", () => {
        expect(syncStageLabel("matching")).toBe("Generando tus matches…");
    });
    it("labels done", () => {
        expect(syncStageLabel("done")).toBe("¡Listo!");
    });
    it("returns empty for idle/error (they render their own UI)", () => {
        const silent: SyncStage[] = ["idle", "error"];
        for (const s of silent) {
            expect(syncStageLabel(s)).toBe("");
        }
    });
});

describe("onboarding redirect policy", () => {
    it("sends users without a profile to onboarding", () => {
        expect(shouldRedirectToOnboarding(false)).toBe(true);
        expect(shouldRedirectToOnboarding(true)).toBe(false);
    });
    it("sends users with a profile to the feed", () => {
        expect(shouldRedirectToFeed(true)).toBe(true);
        expect(shouldRedirectToFeed(false)).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/frontend/lib/onboarding.test.ts`
Expected: FAIL — cannot resolve `@/frontend/lib/onboarding` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/frontend/lib/onboarding.ts`:

```ts
// Pure onboarding/sync helpers. No React, no I/O — unit-tested and shared by the
// onboarding wizard, the feed sync flow, and the route guard.

export type SyncStage = "idle" | "ingesting" | "matching" | "done" | "error";

// Spanish label shown under the spinner during the feed sync chain. Empty for
// non-running stages (idle/error render their own UI).
export function syncStageLabel(stage: SyncStage): string {
    switch (stage) {
        case "ingesting":
            return "Escaneando tu bolsa y analizando con IA…";
        case "matching":
            return "Generando tus matches…";
        case "done":
            return "¡Listo!";
        default:
            return "";
    }
}

// Onboarding is "complete" once a profile exists — the CV-upload step is the
// only path that creates one. These two functions name the guard policy so the
// (app) guard and the onboarding page cannot drift apart.
export function shouldRedirectToOnboarding(hasProfile: boolean): boolean {
    return !hasProfile;
}

export function shouldRedirectToFeed(hasProfile: boolean): boolean {
    return hasProfile;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/frontend/lib/onboarding.test.ts`
Expected: PASS (6 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/lib/onboarding.ts src/frontend/lib/onboarding.test.ts
git commit -m "feat(onboarding): pure stage-label + redirect-policy helpers"
```

---

### Task 2: `useSyncBolsa` orchestration hook

**Files:**
- Create: `src/frontend/hooks/use-sync-bolsa.ts`

No DOM test runner exists, so this hook is verified via `pnpm check` (types) + `pnpm build` and exercised by Task 5's manual walk. Its only branching logic (the stage→label map) is already unit-tested in Task 1.

- [ ] **Step 1: Write the hook**

Create `src/frontend/hooks/use-sync-bolsa.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { useRunIngestion, useRunMatching } from "@/frontend/hooks/api";
import { type SyncStage, syncStageLabel } from "@/frontend/lib/onboarding";

export interface UseSyncBolsa {
    stage: SyncStage;
    label: string;
    isRunning: boolean;
    error: unknown;
    start: () => void;
}

// Orchestrates the feed sync chain client-side: ingest (scan + AI extract) then
// match. Progress is staged, not streamed — `stage` drives the label; the run
// metrics surface via the existing useLastIngestion query, which the mutations
// invalidate on success.
export function useSyncBolsa(): UseSyncBolsa {
    const runIngestion = useRunIngestion();
    const runMatching = useRunMatching();
    const [stage, setStage] = useState<SyncStage>("idle");
    const [error, setError] = useState<unknown>(null);

    const start = useCallback(() => {
        setError(null);
        setStage("ingesting");
        void (async () => {
            try {
                await runIngestion.mutateAsync();
                setStage("matching");
                await runMatching.mutateAsync();
                setStage("done");
            } catch (e) {
                setError(e);
                setStage("error");
            }
        })();
    }, [runIngestion, runMatching]);

    return {
        stage,
        label: syncStageLabel(stage),
        isRunning: stage === "ingesting" || stage === "matching",
        error,
        start,
    };
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm check`
Expected: PASS (biome + `tsc --noEmit`, no errors).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/hooks/use-sync-bolsa.ts
git commit -m "feat(feed): useSyncBolsa hook chaining ingest -> match with a stage machine"
```

---

### Task 3: `RequireOnboarded` guard + wire into the (app) layout

**Files:**
- Create: `src/frontend/components/require-onboarded.tsx`
- Modify: `src/app/(app)/layout.tsx`

Guard logic uses the Task 1 `shouldRedirectToOnboarding` helper. Verified via `pnpm check` + `pnpm build`.

- [ ] **Step 1: Write the guard**

Create `src/frontend/components/require-onboarded.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useProfile } from "@/frontend/hooks/api";
import { shouldRedirectToOnboarding } from "@/frontend/lib/onboarding";

// Guards the (app) group: a signed-in user without a profile has not finished
// onboarding, so send them to the wizard. Must be nested inside RequireSession
// (the profile query needs an authenticated session).
export function RequireOnboarded({ children }: { children: ReactNode }) {
    const profile = useProfile();
    const router = useRouter();
    const hasProfile = Boolean(profile.data?.profile);

    useEffect(() => {
        if (!profile.isPending && shouldRedirectToOnboarding(hasProfile)) {
            router.replace("/onboarding");
        }
    }, [profile.isPending, hasProfile, router]);

    if (profile.isPending || shouldRedirectToOnboarding(hasProfile)) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }
    return <>{children}</>;
}
```

- [ ] **Step 2: Wire it into the (app) layout**

Replace the entire contents of `src/app/(app)/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import { AppNav } from "@/frontend/components/app-nav";
import { RequireOnboarded } from "@/frontend/components/require-onboarded";
import { RequireSession } from "@/frontend/components/require-session";

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <RequireSession>
            <RequireOnboarded>
                <AppNav />
                <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
            </RequireOnboarded>
        </RequireSession>
    );
}
```

- [ ] **Step 3: Verify types + build**

Run: `pnpm check && pnpm build`
Expected: PASS. (`/onboarding` is outside the `(app)` group, so the guard cannot loop back into onboarding.)

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/require-onboarded.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(onboarding): RequireOnboarded guard routes profile-less users to the wizard"
```

---

### Task 4: Onboarding wizard (steps + shell + page)

**Files:**
- Create: `src/frontend/components/onboarding/connect-gmail-step.tsx`
- Create: `src/frontend/components/onboarding/upload-cv-step.tsx`
- Create: `src/frontend/components/onboarding/onboarding-wizard.tsx`
- Modify: `src/app/onboarding/page.tsx`

Verified via `pnpm check` + `pnpm build` + manual walk.

- [ ] **Step 1: Write the Connect-Gmail step**

Create `src/frontend/components/onboarding/connect-gmail-step.tsx`:

```tsx
"use client";

import { Mail } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";

export function ConnectGmailStep() {
    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <div className="rounded-2xl bg-brand/10 p-4 text-brand">
                <Mail className="size-8" />
            </div>
            <div className="space-y-2">
                <h2 className="font-serif font-bold text-2xl text-foreground">
                    Conecta tu Gmail
                </h2>
                <p className="text-muted-foreground text-sm">
                    Leemos solo los correos de la bolsa de trabajo (acceso de
                    solo lectura). Nunca escribimos ni borramos nada.
                </p>
            </div>
            <Button
                type="button"
                size="lg"
                onClick={() => void requestGmailAccess()}
            >
                Conectar Gmail
            </Button>
        </div>
    );
}
```

- [ ] **Step 2: Write the Upload-CV step** (ports the dropzone from the current page)

Create `src/frontend/components/onboarding/upload-cv-step.tsx`:

```tsx
"use client";

import { FileText, UploadCloud } from "lucide-react";
import { type ChangeEvent, useEffect } from "react";
import { toast } from "sonner";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useUploadCv } from "@/frontend/hooks/api";
import { errorMessage } from "@/frontend/lib/format";
import { cn } from "@/frontend/lib/utils";

export function UploadCvStep() {
    const uploadCv = useUploadCv();

    useEffect(() => {
        if (uploadCv.isError) {
            toast.error(errorMessage(uploadCv.error));
        }
    }, [uploadCv.isError, uploadCv.error]);

    function onCvChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            e.target.value = "";
            uploadCv.mutate({ file });
        }
    }

    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <div className="rounded-2xl bg-brand/10 p-4 text-brand">
                <FileText className="size-8" />
            </div>
            <div className="space-y-2">
                <h2 className="font-serif font-bold text-2xl text-foreground">
                    Sube tu CV (PDF)
                </h2>
                <p className="text-muted-foreground text-sm">
                    Extraemos tu perfil profesional para personalizar tus
                    matches.
                </p>
            </div>
            <label
                htmlFor="cv-file"
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors",
                    uploadCv.isPending
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer hover:border-brand hover:bg-brand/5",
                )}
            >
                <input
                    id="cv-file"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={onCvChange}
                    disabled={uploadCv.isPending}
                />
                {uploadCv.isPending ? (
                    <>
                        <Spinner className="size-8 text-primary" />
                        <p className="animate-pulse font-semibold text-primary text-sm">
                            Procesando…
                        </p>
                        <p className="text-muted-foreground text-xs">
                            Nuestra IA está extrayendo tus habilidades.
                        </p>
                    </>
                ) : (
                    <>
                        <UploadCloud className="size-10 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                            Arrastra tu archivo aquí o
                        </p>
                        <span className="inline-flex h-9 items-center rounded-md border bg-background px-4 font-medium text-sm shadow-xs hover:bg-accent">
                            Elegir archivo
                        </span>
                        <p className="text-muted-foreground text-xs">
                            Solo archivos PDF (máx. 5 MB)
                        </p>
                    </>
                )}
            </label>
        </div>
    );
}
```

- [ ] **Step 3: Write the wizard shell**

Create `src/frontend/components/onboarding/onboarding-wizard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ConnectGmailStep } from "@/frontend/components/onboarding/connect-gmail-step";
import {
    type Step,
    Stepper,
} from "@/frontend/components/onboarding/stepper";
import { UploadCvStep } from "@/frontend/components/onboarding/upload-cv-step";
import { Card, CardContent } from "@/frontend/components/ui/card";
import { Spinner } from "@/frontend/components/ui/spinner";
import { useMe, useProfile } from "@/frontend/hooks/api";
import { shouldRedirectToFeed } from "@/frontend/lib/onboarding";

export function OnboardingWizard() {
    const router = useRouter();
    const me = useMe();
    const profile = useProfile();

    const isPending = me.isPending || profile.isPending;
    const gmailConnected = me.data?.gmailConnected ?? false;
    const hasProfile = Boolean(profile.data?.profile);

    // Onboarding is complete once a profile exists — redirect and never re-show.
    useEffect(() => {
        if (!isPending && shouldRedirectToFeed(hasProfile)) {
            router.replace("/feed");
        }
    }, [isPending, hasProfile, router]);

    if (isPending || hasProfile) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Spinner className="size-8 text-primary" />
            </div>
        );
    }

    const steps: Step[] = [
        { label: "Conexión", state: gmailConnected ? "completed" : "active" },
        { label: "Perfil", state: gmailConnected ? "active" : "upcoming" },
    ];

    return (
        <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-12">
            <Stepper steps={steps} />
            <Card>
                <CardContent className="pt-6">
                    {gmailConnected ? <UploadCvStep /> : <ConnectGmailStep />}
                </CardContent>
            </Card>
        </main>
    );
}
```

- [ ] **Step 4: Swap the onboarding page to render the wizard**

Replace the entire contents of `src/app/onboarding/page.tsx` with:

```tsx
import { OnboardingWizard } from "@/frontend/components/onboarding/onboarding-wizard";
import { RequireSession } from "@/frontend/components/require-session";

export default function OnboardingPage() {
    return (
        <RequireSession>
            <OnboardingWizard />
        </RequireSession>
    );
}
```

- [ ] **Step 5: Verify types + build**

Run: `pnpm check && pnpm build`
Expected: PASS. The old `StepCard` import is gone from the page; `step-card.tsx` is now unused but left in place (no other consumers; removing it is out of scope).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/onboarding/connect-gmail-step.tsx src/frontend/components/onboarding/upload-cv-step.tsx src/frontend/components/onboarding/onboarding-wizard.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): full-screen one-step wizard (Gmail -> CV -> feed)"
```

---

### Task 5: Feed sync UI (CTA / progress / error) + wire feed page

**Files:**
- Create: `src/frontend/components/feed/sync-cta.tsx`
- Create: `src/frontend/components/feed/sync-progress.tsx`
- Create: `src/frontend/components/feed/sync-error.tsx`
- Modify: `src/app/(app)/feed/page.tsx`

Verified via `pnpm check` + `pnpm build` + manual walk.

- [ ] **Step 1: Write the first-run CTA**

Create `src/frontend/components/feed/sync-cta.tsx`:

```tsx
"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";

interface SyncCtaProps {
    onSync: () => void;
}

export function SyncCta({ onSync }: SyncCtaProps) {
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
                    <Sparkles aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="font-serif">
                    Sincroniza tu bolsa de trabajo
                </EmptyTitle>
                <EmptyDescription>
                    Escaneamos los correos de la bolsa, filtramos el ruido con IA
                    y generamos tus mejores matches.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button type="button" size="lg" onClick={onSync}>
                    <Sparkles />
                    Sincronizar mi bolsa
                </Button>
            </EmptyContent>
        </Empty>
    );
}
```

- [ ] **Step 2: Write the staged progress UI**

Create `src/frontend/components/feed/sync-progress.tsx`:

```tsx
"use client";

import { Spinner } from "@/frontend/components/ui/spinner";

interface SyncProgressProps {
    label: string;
}

export function SyncProgress({ label }: SyncProgressProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <Spinner className="size-10 text-brand" />
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
            </div>
            <p className="font-medium text-foreground text-sm">{label}</p>
        </div>
    );
}
```

- [ ] **Step 3: Write the sync error UI**

Create `src/frontend/components/feed/sync-error.tsx`:

```tsx
"use client";

import { AlertTriangle } from "lucide-react";
import { requestGmailAccess } from "@/frontend/auth/gmail";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { errorCode, errorMessage } from "@/frontend/lib/format";

interface SyncErrorProps {
    error: unknown;
    onRetry: () => void;
}

export function SyncError({ error, onRetry }: SyncErrorProps) {
    const gmailIssue = errorCode(error) === "gmail_not_connected";
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia
                    variant="icon"
                    className="bg-destructive/10 text-destructive"
                >
                    <AlertTriangle aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="font-serif">
                    No pudimos sincronizar
                </EmptyTitle>
                <EmptyDescription>{errorMessage(error)}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                {gmailIssue ? (
                    <Button
                        type="button"
                        onClick={() => void requestGmailAccess()}
                    >
                        Reconectar Gmail
                    </Button>
                ) : (
                    <Button type="button" onClick={onRetry}>
                        Reintentar
                    </Button>
                )}
            </EmptyContent>
        </Empty>
    );
}
```

- [ ] **Step 4: Wire the states into the feed page**

Replace the entire contents of `src/app/(app)/feed/page.tsx` with:

```tsx
"use client";

import { RefreshCw, SearchX } from "lucide-react";
import { useQueryState } from "nuqs";
import { type ReactNode, Suspense } from "react";
import { FiltersBar } from "@/frontend/components/feed/filters-bar";
import { ImpactPanel } from "@/frontend/components/feed/impact-panel";
import { MatchCard } from "@/frontend/components/feed/match-card";
import { SyncCta } from "@/frontend/components/feed/sync-cta";
import { SyncError } from "@/frontend/components/feed/sync-error";
import { SyncProgress } from "@/frontend/components/feed/sync-progress";
import { Button } from "@/frontend/components/ui/button";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Skeleton } from "@/frontend/components/ui/skeleton";
import {
    useFeed,
    useLastIngestion,
    useSetMatchStatus,
} from "@/frontend/hooks/api";
import { useSyncBolsa } from "@/frontend/hooks/use-sync-bolsa";

function FeedInner() {
    const [soloConSalario, setSoloConSalario] = useQueryState(
        "solo_con_salario",
        { defaultValue: "" },
    );
    const [modalidad, setModalidad] = useQueryState("modalidad", {
        defaultValue: "",
    });
    const [ubicacion, setUbicacion] = useQueryState("ubicacion", {
        defaultValue: "",
    });

    const ingestion = useLastIngestion();
    const sync = useSyncBolsa();
    const feed = useFeed({
        solo_con_salario: soloConSalario,
        modalidad,
        ubicacion,
    });
    const setStatus = useSetMatchStatus();

    const matches = feed.data?.matches ?? [];
    const hasRun = Boolean(ingestion.data?.run);

    // Sync in progress — take over the whole feed body.
    if (sync.isRunning) {
        return <SyncProgress label={sync.label} />;
    }
    // Sync failed.
    if (sync.stage === "error") {
        return <SyncError error={sync.error} onRetry={sync.start} />;
    }
    // Never synced (fresh from onboarding) — large primary CTA.
    if (!ingestion.isPending && !hasRun) {
        return <SyncCta onSync={sync.start} />;
    }

    let feedSection: ReactNode;
    if (feed.isPending) {
        feedSection = (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    } else if (matches.length === 0) {
        feedSection = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <SearchX aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Sin vacantes que coincidan
                    </EmptyTitle>
                    <EmptyDescription>
                        Ajusta los filtros o sincroniza tus correos de nuevo.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    } else {
        feedSection = (
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
            <div className="flex items-center justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={sync.start}
                >
                    <RefreshCw />
                    Sincronizar ahora
                </Button>
            </div>
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
}

export default function FeedPage() {
    return (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <FeedInner />
        </Suspense>
    );
}
```

- [ ] **Step 5: Verify types + build**

Run: `pnpm check && pnpm build`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing tests plus the 6 from Task 1 are green.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components/feed/sync-cta.tsx src/frontend/components/feed/sync-progress.tsx src/frontend/components/feed/sync-error.tsx "src/app/(app)/feed/page.tsx"
git commit -m "feat(feed): first-run sync CTA + staged progress + error states"
```

---

## Manual verification walk (after all tasks)

1. **Fresh user:** sign in with a Google account that has no profile → land on `/onboarding` showing the Gmail step. Click "Conectar Gmail", grant `gmail.readonly` → return to the wizard now showing the CV step (progress dot 1 completed, dot 2 active).
2. Upload a PDF CV → "Procesando…" → on success, auto-redirect to `/feed`.
3. **Feed first run:** the feed shows the large "Sincronizar mi bolsa" CTA. Click it → `SyncProgress` shows "Escaneando tu bolsa y analizando con IA…" then "Generando tus matches…" → on finish, the ImpactPanel shows real stats and match cards render.
4. **Re-sync:** click "Sincronizar ahora" (top-right) → progress shows again → returns to the populated feed.
5. **Guard:** navigate directly to `/feed`, `/perfil`, `/digest` as the now-onboarded user → no redirect. (A profile-less user is bounced to `/onboarding`.)
6. **Re-entry:** visit `/onboarding` as an onboarded user → auto-redirect to `/feed`.
7. **Error path (optional):** revoke Gmail access, then "Sincronizar ahora" → `SyncError` shows "Reconectar Gmail".

---

## Self-Review

**1. Spec coverage:**
- Onboarding shown once, full-screen wizard, Gmail → CV → feed → Tasks 3 (guard), 4 (wizard).
- "Onboarded" derived from `hasProfile`, no migration → Tasks 1 + 3 + 4.
- Run moved to feed; large button first time, small re-sync after → Task 5.
- Staged progress (no streaming) + real final stats via ImpactPanel → Tasks 1 (label) + 2 (hook) + 5 (UI).
- Error handling (CV stays on step + toast; sync error retry; `gmail_not_connected` reconnect) → Tasks 4 (CV) + 5 (sync error).
- Testing: pure units tested; UI via check/build/manual → Tasks 1 + each task's verify steps.
- Out of scope (webhooks, inbox panel, landing polish, new endpoints, migration) → none introduced. ✓ No gaps.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; no "similar to Task N"; all commands explicit. ✓

**3. Type consistency:** `SyncStage` / `syncStageLabel` / `shouldRedirectToOnboarding` / `shouldRedirectToFeed` defined in Task 1 and consumed identically in Tasks 2–4. `useSyncBolsa` exposes `{ stage, label, isRunning, error, start }` (Task 2), all consumed exactly in Task 5 (`sync.isRunning`, `sync.stage`, `sync.label`, `sync.error`, `sync.start`). `Step`/`StepState` reused from the existing `Stepper`. `useMe`/`useProfile`/`useUploadCv`/`useLastIngestion` response shapes (`gmailConnected`, `profile`, `run`) match the actual routers/hooks. ✓
