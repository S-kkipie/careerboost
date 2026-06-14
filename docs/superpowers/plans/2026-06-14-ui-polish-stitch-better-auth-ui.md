# UI Polish (Stitch + better-auth-ui) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise visual quality of every egresado-facing page (landing, login, onboarding, perfil, account, feed, digest) for the hackathon demo by generating page visuals with Stitch and porting them to React/shadcn, dropping in better-auth-ui for the functional auth/account surfaces — with zero backend/data-model change.

**Architecture:** Adopt shadcn/ui as the primitive layer (prerequisite of better-auth-ui), keeping the existing Tailwind v4 oklch token system. Stitch generates the visual mockup for each page; each mockup is ported to React. Wherever Stitch emits a hardcoded (non-functional) auth form, the better-auth-ui component is dropped in instead (`AuthCard` for login, `Settings` for account, `UserButton` for the nav menu). The domain profile (escuela/skills/CV in the `profiles` table) stays a custom card wired to existing hooks.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS `@theme`), shadcn/ui, radix-ui, next-themes, `@better-auth-ui/react` + better-auth-ui shadcn registry, TanStack Query + Eden Treaty, Stitch MCP (`mcp__stitch__*`), Biome, vitest (node env).

**Testing note:** No DOM test runner in this repo (vitest `env=node`). UI tasks are verified by `pnpm check` (biome + `tsc --noEmit`) and `pnpm build`, plus a manual walk in light + dark. Only pure logic (chip-input parsing, localization map) gets vitest unit tests. This matches the spec-06 convention.

**Spec:** `docs/superpowers/specs/2026-06-14-ui-polish-stitch-better-auth-ui-design.md`

---

## File Structure

**Cleanup / infra**
- `src/server/router.test.ts` — restore (deleted in working tree); smoke test for the `/api/v1` mount.
- `components.json` — create; shadcn config with aliases pointing into `src/frontend`.
- `src/frontend/components/ui/*` — shadcn primitives (card, input, label, textarea, tabs, dropdown-menu, avatar, separator, sonner, button, badge, skeleton, tooltip).
- `src/frontend/components/auth/*` — better-auth-ui components copied by the registry (auth card + views, settings, user-button).
- `src/frontend/lib/localization.ts` — extend ES strings for Settings/AuthCard.
- `.stitch/{DESIGN.md,SITE.md,metadata.json,designs/*}` — Stitch scaffold + generated mockups.

**Pages (port targets)**
- `src/app/page.tsx` — landing (custom, from Stitch).
- `src/app/auth/[pathname]/page.tsx` — login + auth views (`AuthCard`). Create.
- `src/app/onboarding/page.tsx` — stepper (custom, from Stitch).
- `src/app/(app)/perfil/page.tsx` — tabs: domain card (custom) + `Settings` (better-auth-ui).
- `src/frontend/components/profile/chips-input.tsx` — chip input for skills/intereses. Create.
- `src/frontend/components/profile/chips-input.test.ts` — unit test for chip parsing logic (the pure helper lives in `format.ts` or a local module). Create.
- `src/frontend/components/app-nav.tsx` — `UserButton` + theme toggle + links.
- `src/frontend/components/theme-toggle.tsx` — next-themes toggle. Create.
- `src/frontend/components/feed/*`, `src/app/(app)/digest/page.tsx` — restyle to shadcn primitives.

---

## Task 0: Clean the working tree (finish the in-flight /api/v1 move)

The working tree has an unfinished refactor: `src/app/api/[[...slugs]]/route.ts` deleted, `src/app/api/v1/[[...slugs]]/route.ts` added (with GET/POST/PATCH/DELETE), `src/frontend/auth/auth.ts` baseURL changed to `${baseUrl}/api/v1/auth`, and `src/server/router.test.ts` deleted. Land it cleanly so the tree is green before UI work.

**Files:**
- Restore: `src/server/router.test.ts`
- Verify: `src/app/api/v1/[[...slugs]]/route.ts`, `src/frontend/auth/auth.ts`

- [ ] **Step 1: Confirm the Elysia app prefix matches the new mount**

Run: `grep -n "prefix" src/server/router.ts`
Expected: the app is constructed with prefix `/api/v1` (so requests to `/api/v1/health` resolve under the `app/api/v1/[[...slugs]]` Next route). If the prefix is NOT `/api/v1`, STOP and reconcile before continuing.

- [ ] **Step 2: Restore the router smoke test**

Create `src/server/router.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import app from "./router";

describe("router", () => {
    it("GET /api/v1/health returns { ok: true }", async () => {
        const res = await app.handle(
            new Request("http://localhost/api/v1/health"),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });
});
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm test src/server/router.test.ts`
Expected: PASS (1 test). If FAIL with a 404, the route prefix is wrong — fix `router.ts`/route mount until it passes.

- [ ] **Step 4: Full green check**

Run: `pnpm check && pnpm test`
Expected: biome clean, `tsc --noEmit` clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api src/frontend/auth/auth.ts src/server/router.test.ts
git commit -m "refactor(api): mount Elysia under /api/v1 route segment, restore smoke test"
```

---

## Task 1: Initialize shadcn/ui (keep oklch tokens)

**Files:**
- Create: `components.json`
- Modify: `src/app/globals.css` (only if shadcn needs base layer additions; keep existing tokens)

- [ ] **Step 1: Create `components.json` with aliases into `src/frontend`**

The repo keeps UI under `src/frontend`, not the shadcn default `src/`. Point aliases there so registry installs land in the right place. Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/frontend/components",
    "ui": "@/frontend/components/ui",
    "utils": "@/frontend/lib/utils",
    "lib": "@/frontend/lib",
    "hooks": "@/frontend/hooks"
  }
}
```

- [ ] **Step 2: Install lucide-react (icon lib used by shadcn + better-auth-ui)**

Run: `pnpm add lucide-react`
Expected: added to dependencies.

- [ ] **Step 3: Add base shadcn primitives**

Run:
```bash
pnpm dlx shadcn@latest add card input label textarea tabs dropdown-menu avatar separator sonner --yes --overwrite
```
Expected: components written to `src/frontend/components/ui/`. If the CLI prompts about Tailwind v4 / React 19, accept defaults. It must NOT rewrite `globals.css` tokens — if it offers to, decline token changes (we keep our oklch palette).

- [ ] **Step 4: Verify tokens intact**

Run: `git diff src/app/globals.css`
Expected: no change to the `:root`/`.dark` oklch variables. If shadcn added `@layer base` rules that duplicate token definitions, revert those lines so our oklch palette is the single source.

- [ ] **Step 5: Add the Toaster to the providers tree**

Modify `src/frontend/providers/providers.tsx` — import and render `<Toaster />` from `@/frontend/components/ui/sonner` just inside `<TooltipProvider>` (so toasts work app-wide).

```tsx
import { Toaster } from "@/frontend/components/ui/sonner";
// ...inside the tree, after {children} within TooltipProvider scope:
<Toaster richColors position="top-center" />
```

- [ ] **Step 6: Green check + commit**

Run: `pnpm check && pnpm build`
Expected: clean build.

```bash
git add components.json package.json pnpm-lock.yaml src/frontend/components/ui src/frontend/providers/providers.tsx
git commit -m "chore(ui): init shadcn/ui with src/frontend aliases, keep oklch tokens"
```

---

## Task 2: Migrate hand-rolled primitives to shadcn

The repo has hand-rolled `ui/button.tsx` (exports `Button` + `buttonClasses`), `ui/badge.tsx`, `ui/skeleton.tsx`, `ui/spinner.tsx`, `ui/tooltip.tsx`. Replace `button`/`badge`/`skeleton`/`tooltip` with shadcn versions; keep `spinner` (shadcn has no spinner). Preserve any callsite contracts.

**Files:**
- Modify: `src/frontend/components/ui/button.tsx`, `badge.tsx`, `skeleton.tsx`, `tooltip.tsx`
- Modify callsites: `app-nav.tsx`, `feed/*`, `digest/page.tsx`, `onboarding/page.tsx`, `perfil/page.tsx`, `page.tsx`

- [ ] **Step 1: Inventory callsite contracts**

Run:
```bash
grep -rn "buttonClasses\|from \"@/frontend/components/ui/button\"\|ui/badge\|ui/skeleton\|ui/tooltip" src/
```
Expected: a list of imports. Note `buttonClasses(variant,size)` usages in `app-nav.tsx` — shadcn exposes `buttonVariants({ variant, size })` instead.

- [ ] **Step 2: Install shadcn button/badge/skeleton/tooltip**

Run:
```bash
pnpm dlx shadcn@latest add button badge skeleton tooltip --yes --overwrite
```
Expected: these four files in `ui/` replaced with shadcn versions (button now exports `Button` + `buttonVariants`).

- [ ] **Step 3: Replace `buttonClasses` usages with `buttonVariants`**

In every file using `buttonClasses("ghost","sm")` (e.g. `app-nav.tsx`), change the import to `buttonVariants` and call `buttonVariants({ variant: "ghost", size: "sm" })`. Map old size names to shadcn (`md` → `default`).

- [ ] **Step 4: Reconcile size/variant names across callsites**

shadcn button sizes are `default | sm | lg | icon` (no `md`). Replace `size="md"` with `size="default"` (or drop the prop) at all callsites found in Step 1 (`page.tsx`, `onboarding/page.tsx`, `perfil/page.tsx`, feed components).

- [ ] **Step 5: Keep `TooltipProvider` import working**

shadcn tooltip exports `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`. Confirm `providers.tsx` still imports `TooltipProvider` from `@/frontend/components/ui/tooltip`. Fix if the path/export changed.

- [ ] **Step 6: Green check**

Run: `pnpm check && pnpm build`
Expected: clean. Fix any type errors from prop renames until green.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components src/app
git commit -m "refactor(ui): migrate primitives to shadcn (button/badge/skeleton/tooltip)"
```

---

## Task 3: Install better-auth-ui components + extend ES localization

**Files:**
- Create: `src/frontend/components/auth/*` (via registry)
- Modify: `src/frontend/lib/localization.ts`

- [ ] **Step 1: Install auth + settings + user-button from the better-auth-ui registry**

Run:
```bash
pnpm dlx shadcn@latest add https://better-auth-ui.com/r/auth.json https://better-auth-ui.com/r/settings.json https://better-auth-ui.com/r/user-button.json --yes --overwrite
```
Expected: components copied to `src/frontend/components/auth/` (auth card + views, settings, user-button) plus any shadcn deps they pull. If the CLI asks to overwrite an existing `ui/` primitive, accept (shadcn versions are canonical now).

- [ ] **Step 2: Confirm exported component paths**

Run: `ls src/frontend/components/auth && grep -rln "AuthCard\|export function Settings\|export function UserButton" src/frontend/components/auth`
Expected: files for `AuthCard`/sign-in views, `Settings`, `UserButton`. Note the exact import paths for use in later tasks.

- [ ] **Step 3: Extend `spanishLocalization`**

Open `src/frontend/lib/localization.ts`. Add ES strings the Settings/AuthCard surfaces need (only keys not already present). At minimum:

```typescript
// merge into the existing spanishLocalization object:
account: "Cuenta",
security: "Seguridad",
profile: "Perfil",
name: "Nombre",
email: "Correo",
avatar: "Foto",
changeAvatar: "Cambiar foto",
saveChanges: "Guardar cambios",
updateEmail: "Actualizar correo",
sessions: "Sesiones",
revoke: "Revocar",
settings: "Configuración",
signInWith: "Continuar con",
```

Match the actual key names better-auth-ui expects — check the localization type the package exports (`grep -rn "Localization" node_modules/@better-auth-ui/react/dist/*.d.ts | head`). Use only valid keys; do not invent keys (would be a type error).

- [ ] **Step 4: Green check + commit**

Run: `pnpm check && pnpm build`
Expected: clean.

```bash
git add src/frontend/components/auth src/frontend/lib/localization.ts package.json pnpm-lock.yaml
git commit -m "feat(ui): install better-auth-ui (auth/settings/user-button) + ES strings"
```

---

## Task 4: Stitch scaffold + design system

**Files:**
- Create: `.stitch/DESIGN.md`, `.stitch/SITE.md`, `.stitch/metadata.json`

- [ ] **Step 1: Extract a DESIGN.md from the current token system**

Use the `stitch-design:extract-design-md` skill against `src/app/globals.css` + `src/frontend/components/ui` to produce `.stitch/DESIGN.md` (oklch palette: primary blue, success green, warning amber; radius 0.625rem; Inter; light/dark). The DESIGN.md "design system block" is what every Stitch prompt embeds for consistency.

- [ ] **Step 2: Write `.stitch/SITE.md`**

Create `.stitch/SITE.md` with: site vision (CONECTA UNSA — institutional, trustworthy, clear; ES copy), Stitch Project ID (filled in next step), sitemap (landing, login, onboarding, perfil, cuenta, feed, digest — all `[ ]` initially), and a roadmap section.

- [ ] **Step 3: Create the Stitch project + persist metadata**

Call `mcp__stitch__create_project` (title "CareerBoost — CONECTA UNSA", DESKTOP), then `mcp__stitch__get_project`, and write `.stitch/metadata.json` per the stitch-loop schema (projectId, designTheme, empty `screens` map). Put the projectId into `.stitch/SITE.md`.

- [ ] **Step 4: Commit**

```bash
git add .stitch
git commit -m "chore(stitch): scaffold DESIGN.md, SITE.md, project metadata"
```

---

## Task 5: Generate Stitch mockups for all pages

Generate one screen per page. After each, download HTML + PNG and update `.stitch/metadata.json` `screens`. Each prompt MUST embed the DESIGN.md design-system block (Section for Stitch) so styles stay consistent.

**Files:**
- Create: `.stitch/designs/{landing,login,onboarding,perfil,cuenta,feed,digest}.{html,png}`
- Modify: `.stitch/metadata.json`, `.stitch/SITE.md` (mark sitemap `[x]`)

- [ ] **Step 1: Landing mockup**

Call `mcp__stitch__generate_screen_from_text` (projectId from metadata, deviceType DESKTOP) with a prompt for: top nav (CareerBoost wordmark, theme toggle, "Entrar"), hero with institutional-trust headline + Google CTA, impact band (100+ correos/mes · 27% ruido · 90% sin salario), 3-step "cómo funciona", trust footer (UNSA · datos protegidos · Gmail solo-lectura). Embed DESIGN block. Save HTML→`.stitch/designs/landing.html`, PNG→`.stitch/designs/landing.png` (append `=w{width}` to the screenshot URL).

- [ ] **Step 2: Login mockup**

Prompt: split layout — left brand panel (value prop, UNSA trust), right an auth card slot with a single "Continuar con Google" button (this card slot will be replaced by better-auth-ui `AuthCard` at port time). Save `login.{html,png}`.

- [ ] **Step 3: Onboarding mockup**

Prompt: 3-step wizard with a progress indicator. Step cards: (1) Conectar Gmail (solo-lectura), (2) Subir CV (drag-drop zone), (3) Sincronizar + Generar matches (with counters). Completed/active/disabled states. Save `onboarding.{html,png}`.

- [ ] **Step 4: Perfil mockup**

Prompt: page with two tabs "Perfil profesional" / "Cuenta". Perfil tab: grouped sections Académico / Profesional (skills + intereses as removable chips) / Preferencias / CV (current + re-upload). Cuenta tab: a settings form placeholder (replaced by `Settings`). Save `perfil.{html,png}`.

- [ ] **Step 5: Feed + Digest mockups**

Two prompts. Feed: impact panel + filter bar + match cards (% match, "por qué", salary badge green/grey, save/dismiss). Digest: "Tu digest" header, "100+ correos en 1 resumen" message, match cards, "Marcar como visto". Save `feed.{html,png}`, `digest.{html,png}`.

- [ ] **Step 6: Persist + commit**

Update `.stitch/metadata.json` screens and `.stitch/SITE.md` sitemap `[x]`.

```bash
git add .stitch
git commit -m "design(stitch): generate mockups for all pages"
```

---

## Task 6: Port landing `/`

**Files:**
- Modify: `src/app/page.tsx`
- Maybe create: `src/frontend/components/landing/*` (sectional components if the page gets large)

- [ ] **Step 1: Port the Stitch landing HTML to React**

Rewrite `src/app/page.tsx` reproducing `.stitch/designs/landing.png` with shadcn primitives + Tailwind oklch tokens. Keep the existing auth behavior exactly: `authClient.useSession()`, redirect authed → `/feed`, and the CTA. The CTA now links to `/auth/sign-in` (Task 7) via `<Link>` (instead of calling `signIn.social` inline) — OR keep `handleLogin` calling `authClient.signIn.social({ provider:"google", callbackURL:"/onboarding" })`. Pick the link to `/auth/sign-in` so the branded login page is used.

Keep the pending/redirect guard:

```tsx
if (isPending || session) {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <Spinner className="size-8 text-primary" />
        </div>
    );
}
```

Decompose into section components under `components/landing/` if `page.tsx` exceeds ~150 lines.

- [ ] **Step 2: Verify light + dark**

Run: `pnpm build` then `pnpm dev` and load `/` in both themes. Confirm hero, impact band, steps, footer render and the CTA navigates to `/auth/sign-in`.

- [ ] **Step 3: Green check + commit**

Run: `pnpm check`

```bash
git add src/app/page.tsx src/frontend/components/landing
git commit -m "feat(ui): landing hero + impact band + how-it-works (from Stitch)"
```

---

## Task 7: Login route with better-auth-ui `AuthCard`

**Files:**
- Create: `src/app/auth/[pathname]/page.tsx`
- Reference: `src/frontend/components/auth/*`, `src/frontend/providers/providers.tsx`

- [ ] **Step 1: Create the auth catch-all route**

`AuthCard` renders the correct view from the path. Create `src/app/auth/[pathname]/page.tsx`:

```tsx
import { AuthCard } from "@/frontend/components/auth/auth-card";

export default async function AuthPage({
    params,
}: {
    params: Promise<{ pathname: string }>;
}) {
    const { pathname } = await params;
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <AuthCard pathname={pathname} />
        </main>
    );
}
```

Adjust the import path/prop name to the actual `auth-card` file from Task 3 Step 2 (some versions take `view` instead of `pathname`, or are used as a server route with `<AuthView>`). Verify against the installed component's signature.

- [ ] **Step 2: Wrap with the Stitch branded split layout**

Wrap `AuthCard` in the left-brand-panel / right-card layout ported from `.stitch/designs/login.png`. The card slot is `AuthCard` (functional), the brand panel is static markup.

- [ ] **Step 3: Confirm provider config drives Google-only ES**

No change expected — `providers.tsx` already sets `socialProviders=["google"]`, `emailAndPassword.enabled=false`, `redirectTo=/onboarding`, `localization=spanishLocalization`, `navigate`. Confirm the card shows only "Continuar con Google" in Spanish.

- [ ] **Step 4: Manual verify the funnel**

Run: `pnpm dev`. From `/` click CTA → `/auth/sign-in` → Google → `/onboarding`. (OAuth requires the redirect URI configured; if creds aren't live, at least confirm the page renders and the button triggers the social flow.)

- [ ] **Step 5: Green check + commit**

Run: `pnpm check && pnpm build`

```bash
git add src/app/auth
git commit -m "feat(auth-ui): branded /auth login route using better-auth-ui AuthCard"
```

---

## Task 8: Port onboarding stepper `/onboarding`

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Maybe create: `src/frontend/components/onboarding/*`

- [ ] **Step 1: Port the stepper UI, keep all wiring**

Rewrite the inner `OnboardingFlow` to match `.stitch/designs/onboarding.png` (progress indicator + 3 step cards) while preserving EVERY existing hook and gate:
- `useMe()` → `gmailConnected = me.data?.gmailConnected ?? false`
- `useProfile()` → `hasProfile`
- `useUploadCv()`, `useRunIngestion()`, `useRunMatching()`
- CV `<input type="file" accept="application/pdf">` (hidden, styled label), reset `e.target.value` before mutate.
- Gate: "Sincronizar" disabled unless `gmailConnected`; "Generar matches" disabled unless `hasProfile`.
- `onGenerate` → `await runMatching.mutateAsync()` then `router.push("/feed")`.

- [ ] **Step 2: Replace inline error `<p>` with sonner toasts**

For `uploadCv.isError`, `runIngestion.isError`, `runMatching.isError`, call `toast.error(errorMessage(err))` from `sonner` in an effect or mutation `onError`, instead of (or in addition to) inline text. Keep success ✓ markers.

- [ ] **Step 3: Keep `RequireSession` wrapper**

`export default function OnboardingPage()` still returns `<RequireSession><OnboardingFlow/></RequireSession>`.

- [ ] **Step 4: Manual verify**

Run: `pnpm dev`, load `/onboarding`. Confirm step states, file picker, disabled gating, toast on error.

- [ ] **Step 5: Green check + commit**

Run: `pnpm check && pnpm build`

```bash
git add src/app/onboarding src/frontend/components/onboarding
git commit -m "feat(ui): onboarding wizard with progress + toasts (from Stitch)"
```

---

## Task 9: Perfil tabs — domain card (custom) + `Settings` (better-auth-ui) + chip input

**Files:**
- Create: `src/frontend/lib/chips.ts` (pure parse/format helpers)
- Create: `src/frontend/lib/chips.test.ts`
- Create: `src/frontend/components/profile/chips-input.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`

- [ ] **Step 1: Write the failing test for chip parsing helpers**

Create `src/frontend/lib/chips.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { addChip, parseChips } from "./chips";

describe("parseChips", () => {
    it("splits on comma, trims, drops empties", () => {
        expect(parseChips("React, , Node ,")).toEqual(["React", "Node"]);
    });
    it("returns [] for blank", () => {
        expect(parseChips("   ")).toEqual([]);
    });
});

describe("addChip", () => {
    it("appends a trimmed value", () => {
        expect(addChip(["React"], " Node ")).toEqual(["React", "Node"]);
    });
    it("ignores blank and case-insensitive duplicates", () => {
        expect(addChip(["React"], "react")).toEqual(["React"]);
        expect(addChip(["React"], "  ")).toEqual(["React"]);
    });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm test src/frontend/lib/chips.test.ts`
Expected: FAIL ("Cannot find module './chips'").

- [ ] **Step 3: Implement `chips.ts`**

Create `src/frontend/lib/chips.ts`:

```typescript
export function parseChips(value: string): string[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export function addChip(chips: string[], value: string): string[] {
    const v = value.trim();
    if (v.length === 0) return chips;
    if (chips.some((c) => c.toLowerCase() === v.toLowerCase())) return chips;
    return [...chips, v];
}
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `pnpm test src/frontend/lib/chips.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Build the `ChipsInput` component**

Create `src/frontend/components/profile/chips-input.tsx` — a controlled component: `{ value: string[]; onChange: (next: string[]) => void; placeholder?: string }`. Render existing chips as removable `Badge`s (× button calls `onChange(value.filter(...))`), plus a text `Input`; on Enter or comma, `onChange(addChip(value, input))` and clear. Use `addChip` from `chips.ts`. `"use client"`.

- [ ] **Step 6: Rewrite `perfil/page.tsx` with tabs**

Wrap the page in shadcn `Tabs` with two `TabsTrigger`s: "Perfil profesional" and "Cuenta".
- **Perfil tab:** keep the existing controlled `FormState`/`useProfile`/`useUpdateProfile` logic, but group fields into shadcn `Card` sections (Académico: escuela/grado/ubicación; Profesional: `ChipsInput` for skills + intereses, textarea for experiencia; Preferencias: expectativa salarial number). On submit, build the same payload (use `value` arrays directly from ChipsInput instead of `toList`). Replace inline success/error `<span>` with `toast` + keep a subtle inline ✓.
- **Cuenta tab:** render better-auth-ui `<Settings />` (account + security). Import from `@/frontend/components/auth/settings` (confirm path from Task 3).

Keep the `profileQuery.isPending` → `Skeleton` and `!profile` → empty-state branches.

- [ ] **Step 7: Green check + manual verify**

Run: `pnpm check && pnpm build` then `pnpm dev`. Confirm both tabs render; chips add/remove; save shows toast; account tab shows Settings.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/lib/chips.ts src/frontend/lib/chips.test.ts src/frontend/components/profile src/app/\(app\)/perfil/page.tsx
git commit -m "feat(ui): perfil tabs (domain card + chips) + better-auth-ui Settings"
```

---

## Task 10: Nav `UserButton` + theme toggle

**Files:**
- Create: `src/frontend/components/theme-toggle.tsx`
- Modify: `src/frontend/components/app-nav.tsx`

- [ ] **Step 1: Build the theme toggle**

Create `src/frontend/components/theme-toggle.tsx` ("use client") using `useTheme` from `next-themes` and a shadcn `Button size="icon" variant="ghost"` that toggles `theme` between `light`/`dark` with lucide `Sun`/`Moon` icons. Guard against hydration mismatch (render after mount).

- [ ] **Step 2: Replace the custom sign-out with `UserButton`**

In `app-nav.tsx`, remove the manual `authClient.signOut()` button and render better-auth-ui `<UserButton />` (avatar dropdown with Cerrar sesión + Settings). Add custom links via its `links` prop:

```tsx
<UserButton
    links={[
        { label: "Perfil", href: "/perfil" },
        { label: "Tu digest", href: "/digest" },
    ]}
/>
```

Keep the Feed/Digest/Perfil nav links (or fold Perfil into the UserButton menu). Add `<ThemeToggle />` to the nav bar.

- [ ] **Step 3: Green check + manual verify**

Run: `pnpm check && pnpm build` then `pnpm dev`. Confirm avatar dropdown, sign-out works, theme toggle flips light/dark and persists.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/theme-toggle.tsx src/frontend/components/app-nav.tsx
git commit -m "feat(ui): UserButton dropdown + theme toggle in nav"
```

---

## Task 11: Restyle Feed + Digest to shadcn primitives

**Files:**
- Modify: `src/frontend/components/feed/match-card.tsx`, `impact-panel.tsx`, `filters-bar.tsx`
- Modify: `src/app/(app)/digest/page.tsx`

- [ ] **Step 1: Restyle match-card**

Port `.stitch/designs/feed.png` styling into `match-card.tsx` using shadcn `Card`/`Badge`/`Button`. Keep all props and the save/dismiss/seen actions wired to `useSetMatchStatus`. Keep salary badge semantics (green = explícito via `--success`, grey/muted = no especificado). Do NOT change data flow.

- [ ] **Step 2: Restyle impact-panel + filters-bar**

Apply shadcn `Card` + consistent spacing to `impact-panel.tsx`; restyle `filters-bar.tsx` controls (keep `nuqs` URL-filter wiring intact: `soloConSalario`, `modalidad`, `ubicacion`).

- [ ] **Step 3: Restyle digest page**

Port `.stitch/designs/digest.png` into `digest/page.tsx`: "Tu digest" header, the "100+ correos en 1 resumen" message, MatchCard list, "Marcar como visto" Button (when matches>0). Keep `useDigest`/`useMarkDigestSeen`/`useSetMatchStatus` and the pending/empty branches.

- [ ] **Step 4: Green check + manual verify**

Run: `pnpm check && pnpm build` then `pnpm dev`. Walk `/feed` (filters, save/dismiss) and `/digest` (mark seen) in light + dark.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/feed "src/app/(app)/digest/page.tsx"
git commit -m "style(ui): restyle feed + digest with shadcn primitives"
```

---

## Task 12: Final verification + memory

**Files:**
- Modify: `~/.claude/.../memory/*` (roadmap note)

- [ ] **Step 1: Full pipeline green**

Run: `pnpm check && pnpm test && pnpm build`
Expected: biome clean, `tsc --noEmit` clean, all tests pass (incl. restored router smoke + chips tests), build succeeds.

- [ ] **Step 2: Manual demo walk**

Run: `pnpm dev`. Walk the full funnel in light + dark: `/` → CTA → `/auth/sign-in` → (Google) → `/onboarding` (3 steps) → `/feed` (filters, save/dismiss) → `/perfil` (both tabs, chips, save) → `/digest` (mark seen) → UserButton sign out. Note any visual regressions vs the Stitch PNGs.

- [ ] **Step 3: Update memory**

Update the spec roadmap memory: note the UI-polish branch (Stitch + better-auth-ui + shadcn) and that domain profile stays in `profiles`.

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to present merge/PR options. Do NOT auto-merge/push — wait for explicit user direction (project cadence: controller merges + pushes only when asked).

---

## Self-Review

**Spec coverage:**
- Infra (shadcn init, primitive migration, better-auth-ui install, Stitch scaffold) → Tasks 1–4. ✓
- Stitch-first all pages → Task 5 (mockups) + ports in Tasks 6,8,9,11. ✓
- better-auth-ui where Stitch is hardcoded: login `AuthCard` → Task 7; account `Settings` → Task 9; nav `UserButton` → Task 10. ✓
- Domain profile custom in `profiles` + chips → Task 9. ✓
- shadcn variant, oklch tokens kept → Tasks 1–2. ✓
- Feed/Digest restyle → Task 11. ✓
- Clean the in-flight /api/v1 move + restore smoke test → Task 0. ✓
- No backend/data-model change → respected (only presentation + chips/localization helpers). ✓

**Placeholder scan:** Page markup is intentionally driven by the Stitch PNG outputs rather than inlined verbatim (the visual is generated at execution time); every task that contains *logic* (Task 0 test, Task 9 chips + tabs wiring, Task 10 toggle/UserButton, Task 7 route) shows real code. Wiring contracts (hooks, gates, props) are named explicitly so no behavior is guessed.

**Type consistency:** `parseChips`/`addChip` defined in Task 9 Step 3 and used in Steps 1/5 with matching signatures. `buttonVariants` (Task 2) replaces `buttonClasses` consistently. `Settings`/`AuthCard`/`UserButton` import paths flagged to be confirmed against the actual installed files (Task 3 Step 2) before use in Tasks 7/9/10.

**Risk note:** better-auth-ui component import paths and the `AuthCard` prop name (`pathname` vs `view`) vary by version — Task 3 Step 2 and Task 7 Step 1 explicitly verify against the installed source before wiring.
