# Unified Onboarding + First Sync in Feed — Design

**Date:** 2026-06-14
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** Frontend UX (onboarding wizard + feed first-run/sync) + route guard. One implementation plan.

## Goal

Make account setup a single, focused experience shown **once** after signup, and move the
slow `ingest + match` run out of onboarding and into the **feed**, triggered by a large
manual button the first time and a smaller re-sync button afterward.

- **Onboarding** (`/onboarding`, shown once from account creation): a full-screen wizard,
  one step at a time — **(1) Connect Gmail** (read-only) → **(2) Upload CV (PDF)** → done →
  redirect to `/feed`. No sync/match here.
- **Feed** (`/feed`): houses the "wait-with-progress" experience. First visit (no matches)
  shows a large **"Sincronizar mi bolsa"** button; clicking it orchestrates `ingest → match`
  client-side, shows staged progress (no streaming), then reveals the real `IngestionRun`
  stats (ImpactPanel) + match cards. A smaller **"Sincronizar ahora"** button re-runs later.

This is the first sub-project of a larger UX initiative. Out of scope here (separate
spec/plan each): the **inbox panel**, **Gmail webhooks**, and **landing/pages visual polish**.

## Background — current state

- **Onboarding** (`src/app/onboarding/page.tsx`): a 3-card vertical stepper with manual
  buttons — "Conectar Gmail", a CV upload dropzone, and two separate buttons "Sincronizar
  correos" + "Generar matches" (the latter redirects to `/feed`). Wrapped in `RequireSession`.
- **Feed** (`src/app/(app)/feed/page.tsx`): `ImpactPanel` (from `useLastIngestion`) +
  `FiltersBar` + match cards from `useFeed`. Empty state (`matches.length === 0`) shows an
  `Empty` block "Sin vacantes que coincidan / Ajusta los filtros o sincroniza tus correos".
  No sync trigger lives here today.
- **Hooks** (`src/frontend/hooks/api.ts`): `useMe()` → `me.get` (`{ gmailConnected }`),
  `useProfile()` → `profile.get` (`{ profile }`), `useLastIngestion()` → `ingest.last.get`
  (`{ run }`), `useRunIngestion()` → `POST ingest` (returns the finished `IngestionRun`),
  `useRunMatching()` → `POST match` (returns matches), `useUploadCv()` → `POST profile/cv`
  (invalidates `profile` + `me`). Mutations throw the eden `error` object; `errorMessage()`
  maps known codes to Spanish.
- **Gmail connect**: `requestGmailAccess()` in `src/frontend/auth/gmail.ts`.
- **Session guard**: `RequireSession` (`src/frontend/components/require-session.tsx`,
  client) redirects to `/` when unauthenticated. The `(app)` layout
  (`src/app/(app)/layout.tsx`, server) wraps `RequireSession` + `AppNav` + `<main>`.
  `/onboarding` is **outside** the `(app)` group (so guarding `(app)` cannot loop back into
  onboarding).
- **`ImpactPanel`** (`src/frontend/components/feed/impact-panel.tsx`) already renders the
  four run stats via `buildImpactStats`, and shows "Aún no has sincronizado tus correos."
  when `run` is null.

## Architecture decision

**Client-orchestrated** (no new endpoints, no backend run-orchestration). The wizard and the
feed drive the existing hooks in sequence. The slow `ingest → match` chain runs in the feed,
behind an explicit button. Progress is **staged, not streamed**: the client shows a label per
stage derived from local state, then reveals the real metrics the run already returns.

**"Onboarded" is derived from `hasProfile`** (no schema change, no migration). The profile row
is created only by the CV-upload step inside onboarding, so a profile implies onboarding was
completed. A later Gmail disconnect does **not** send the user back to onboarding — the feed
detects `gmail_not_connected` on sync and prompts to reconnect.

> Considered alternative: an explicit `profiles.onboardingCompletedAt` flag (mini migration).
> Rejected for MVP — `hasProfile` is sufficient and avoids a migration. Revisit only if
> onboarding gains steps that don't create a profile.

## Routing / guard

- New client wrapper **`RequireOnboarded`** (`src/frontend/components/require-onboarded.tsx`):
  uses `useProfile()`; while pending shows a spinner; when loaded and **no profile**, calls
  `router.replace("/onboarding")`; otherwise renders children. Used **inside** the `(app)`
  layout, nested within `RequireSession` (session guaranteed before the profile query runs):

  ```tsx
  // src/app/(app)/layout.tsx
  <RequireSession>
    <RequireOnboarded>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </RequireOnboarded>
  </RequireSession>
  ```

- **`/onboarding`** itself: when `useProfile()` resolves with a profile already present,
  `router.replace("/feed")` (so a completed user never re-sees onboarding).
- Pure helpers (testable, in `src/frontend/lib/onboarding.ts`):
  - `shouldRedirectToOnboarding(hasProfile: boolean): boolean` → `!hasProfile`
  - `shouldRedirectToFeed(hasProfile: boolean): boolean` → `hasProfile`

  (Trivial bodies, but they name the policy and lock it under test so the two guards can't
  drift apart.)

## Onboarding wizard (`/onboarding`)

Full-screen, one step at a time (layout B). Replaces the current 3-card page.

**Components** (`src/frontend/components/onboarding/`):
- `OnboardingWizard` — owns step state, renders progress dots + the active step. Reuses
  `useMe()` (gmailConnected) and `useProfile()` (hasProfile) to derive completion and to
  redirect to `/feed` when already onboarded.
- `WizardProgress` — the top progress dots (Conexión · Perfil). May reuse the existing
  `Stepper` component if it fits; otherwise a small dedicated dots row.
- `ConnectGmailStep` — explains read-only access; button calls `requestGmailAccess()`. When
  `me.gmailConnected` becomes true, the wizard auto-advances to the CV step.
- `UploadCvStep` — the PDF dropzone (port the existing dropzone markup/states: idle /
  pending "Procesando…" / error). On successful upload (`profile` present), the wizard is
  complete → `router.replace("/feed")`.

**Step order is fixed:** Gmail first (sync needs it), CV second (match needs the profile).
There is no "skip" — both are required to finish.

**Derived step state:**
- Step shown = first incomplete step: `!gmailConnected` → Gmail; else `!hasProfile` → CV;
  else → redirect to `/feed`.

## Feed first-run + re-sync (`/feed`)

**New hook `useSyncBolsa()`** (`src/frontend/hooks/use-sync-bolsa.ts`): orchestrates the
chain using the existing mutations.

```ts
export type SyncStage = "idle" | "ingesting" | "matching" | "done" | "error";

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
```

- The hook holds `stage` state, exposes `{ stage, label, isRunning, error, start() }`
  (`start` is the trigger function; the run metrics come from the existing `useLastIngestion`
  query, which the mutations invalidate — the hook does not re-expose the run).
- `start()` does: set `ingesting` → `await runIngestion.mutateAsync()` → set `matching` →
  `await runMatching.mutateAsync()` → set `done`. On throw: set `error`, store the eden error.
- `runIngestion`/`runMatching` already invalidate `ingest.last` and `match` queries on
  success, so the ImpactPanel + feed refresh automatically when the chain finishes.

**Feed UI states** (`src/app/(app)/feed/page.tsx` + `src/frontend/components/feed/`):
1. **First run / empty** (`!ingestion.data?.run && matches.length === 0`, not running):
   `SyncCta` — a large, prominent card with copy ("Sincroniza tu bolsa para descubrir tus
   matches") and a big **"Sincronizar mi bolsa"** button calling `useSyncBolsa().start()`.
2. **Running** (`isRunning`): `SyncProgress` — spinner + indeterminate bar +
   `syncStageLabel(stage)`. Replaces the feed body while running.
3. **Error** (`stage === "error"`): inline error with a **"Reintentar"** button. If the eden
   code is `gmail_not_connected`, show "Reconectar Gmail" (calls `requestGmailAccess()`)
   instead; otherwise `errorMessage(error)`.
4. **Done / populated**: existing `ImpactPanel` (real stats) + `FiltersBar` + match cards.
   A smaller **"Sincronizar ahora"** button lives in/near the ImpactPanel header for re-sync;
   it calls the same `useSyncBolsa().start()`.

`FiltersBar` + filters behavior unchanged. The existing "Sin vacantes que coincidan" empty
state still applies when a run exists but filters exclude everything (distinct from the
never-synced first-run state above).

## Error handling

- **Gmail connect fails** → stays on Gmail step; `requestGmailAccess` surfaces its own error;
  no advance.
- **CV upload fails** (not PDF / >5MB / Gemini extract error) → stays on CV step; toast via
  `errorMessage(uploadCv.error)` (existing behavior).
- **Sync fails** (ingest or match throws) → `SyncProgress` switches to the error state with
  "Reintentar"; `gmail_not_connected` → "Reconectar Gmail".
- All existing constraints hold: never log tokens / CV / raw bodies; Gmail scope stays
  `gmail.readonly`; per-user isolation unchanged (server `where userId = session.user.id`).

## Testing

- **Pure units** (vitest, node env): `syncStageLabel` (each stage → expected Spanish label,
  default empty); `shouldRedirectToOnboarding` / `shouldRedirectToFeed` (true/false).
- No DOM test runner exists — the wizard, `SyncCta`, `SyncProgress`, and the guard are
  verified via `pnpm check` (biome + `tsc --noEmit`) + `pnpm build` + a manual walk
  (consistent with specs 06/07 and the shared-jobs-pool spec).
- All existing tests stay green; no backend/service tests change (no endpoint/service
  changes).

## Out of scope (YAGNI)

- New endpoints or server-side run orchestration (client orchestrates existing hooks).
- Live/streamed progress counters (staged labels + real final stats only).
- `onboardingCompletedAt` flag / any migration (derive from `hasProfile`).
- Inbox panel, Gmail webhooks, landing/pages visual polish (separate sub-projects).
