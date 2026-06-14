# Spec — UI polish: Stitch-generated pages + better-auth-ui

Date: 2026-06-14
Status: Approved (brainstorming) — ready for implementation plan

## Goal

Raise the visual quality of every egresado-facing page for the hackathon demo
without changing backend behavior. Generate the visual design of all pages with
**Stitch**, port each to React/Tailwind v4, and drop in **better-auth-ui**
components wherever Stitch only produces a hardcoded (non-functional) form —
i.e. the auth/account surfaces that need real wiring.

This is a presentation-only effort. No changes to matching, ingestion, digest,
or the data model.

## Decisions (locked during brainstorming)

1. **Stitch-first for all pages.** Stitch generates the visual mockup/code for
   landing, login, onboarding, perfil, account, feed, digest. Each mockup is
   ported to React + shadcn/Tailwind using the existing oklch token system.
2. **better-auth-ui replaces hardcoded forms.** Where Stitch emits a dead form,
   swap in the functional better-auth-ui component:
   - Login form → `SignIn` / `AuthCard` (Google social only).
   - Account/security settings → `Settings` (account + security tabs).
   - Nav user menu / sign out → `UserButton`.
   Surrounding Stitch layout/branding/hero stays.
3. **shadcn/ui is adopted as the primitive layer** (prerequisite of
   better-auth-ui). Init `components.json` (Tailwind v4 preset), keep current
   oklch tokens, migrate the hand-rolled primitives (button/badge/skeleton/
   spinner/tooltip) to shadcn equivalents and update all imports.
4. **Domain profile stays custom.** Fields in the `profiles` table (escuela
   profesional, grado, ubicación, skills, intereses, experiencia, expectativa
   salarial, CV) are NOT Better Auth user fields. They are rendered as a custom,
   restyled card — NOT moved to Better Auth `additionalFields`. The embedding
   pipeline is untouched.
5. **shadcn variant of better-auth-ui** (not HeroUI) — aligns with the existing
   token system.

## Architecture / integration facts

- Stack: Next.js 16 App Router, React 19, Tailwind v4 (CSS `@theme` tokens, no
  `tailwind.config`), radix-ui, next-themes (dark mode tokens already defined),
  `cn()` helper, TanStack Query + Eden Treaty data layer.
- `@better-auth-ui/react` (^1.6.20) is already installed and provides the data
  layer; `AuthProvider` is already wired in `providers.tsx`
  (`redirectTo=/onboarding`, `socialProviders=["google"]`, email/password
  disabled, `spanishLocalization`).
- better-auth-ui visual components are installed via the shadcn registry
  (`npx shadcn add https://better-auth-ui.com/r/<comp>.json`) — they are copied
  into the repo at `@/components/auth/…`, built on shadcn/ui.
  - `r/auth.json` → `AuthCard` + views (sign-in, sign-up, forgot, reset, sign-out)
  - `r/settings.json` → `Settings`, `AccountSettings`, `UserProfile`
  - `r/user-button.json` → `UserButton`, `UserAvatar`
- Stitch is driven via the `mcp__stitch__*` MCP tools. The stitch-loop scaffold
  lives under `.stitch/` (`DESIGN.md`, `SITE.md`, `metadata.json`,
  `designs/<page>.{html,png}`).

## Per-page plan

### Infra (prerequisite, do first)
- Init shadcn/ui; preserve oklch tokens. Install base primitives: `card, input,
  label, textarea, tabs, dropdown-menu, avatar, separator, sonner, button,
  badge, skeleton, tooltip`. Migrate existing primitives → shadcn; fix imports
  across feed/digest/onboarding/perfil.
- Install better-auth-ui components (`auth`, `settings`, `user-button`).
- Extend `spanishLocalization` to cover Settings/AuthCard strings.
- Create `.stitch/DESIGN.md` (from current tokens via extract-design-md) and
  `.stitch/SITE.md`; init Stitch project, persist `.stitch/metadata.json`.

### 1. Landing `/` — Stitch → custom React
Nav (logo + theme toggle + "Entrar") · hero (institutional-trust headline +
Google CTA) · impact band (100+ correos/mes · 27% ruido · 90% sin salario) ·
how-it-works (3 steps) · trust footer (UNSA · datos protegidos · Gmail
solo-lectura). Authed users redirect to `/feed` (existing behavior kept).

### 2. Login `/auth/[pathname]` — better-auth-ui `AuthCard`
Catch-all App Router route. Stitch generates the split branded layout (brand
panel + card slot); the card slot is `AuthCard` (Google-only, ES,
`redirectTo=/onboarding`). Landing CTA links here.

### 3. Onboarding `/onboarding` — Stitch → custom React (stepper)
3-step wizard with progress: (1) Conectar Gmail (solo-lectura, trust copy),
(2) Subir CV (drag-drop + processing state + extracted-profile preview),
(3) Sincronizar + Generar matches (with ingestion counts). Completion ✓ states,
existing gating preserved, errors via sonner toasts. Finish → `/feed`. Wired to
existing `useMe/useProfile/useUploadCv/useRunIngestion/useRunMatching` hooks.

### 4. Perfil `/perfil` — tabs: domain (custom) + account (better-auth-ui)
- Tab **"Perfil profesional"** (custom, `profiles` table): sections Académico
  (escuela/grado/ubicación) · Profesional (skills/intereses as **chip inputs**,
  not raw CSV; experiencia) · Preferencias (expectativa salarial) · CV (current +
  re-upload). Save → toast. Wired to `useProfile/useUpdateProfile`.
- Tab **"Cuenta"**: better-auth-ui `Settings` (name, email, avatar, sessions,
  security).

### 5. Nav `app-nav.tsx` — `UserButton`
Replace the custom sign-out button with `UserButton` (avatar dropdown: Perfil,
Cuenta, Cerrar sesión, theme toggle). Keep Feed/Digest links and `RequireSession`.

### 6. Feed + Digest — restyle pass
Migrate to shadcn primitives (cards/badges/skeleton) without changing logic.
Lighter polish (already developed): match-card, impact-panel, filters-bar.

## Non-goals / cuts
- No changes to matching/ingestion/digest logic or the data model.
- Domain fields stay in `profiles` (not Better Auth `additionalFields`).
- HeroUI variant not used.
- No new backend endpoints.

## Verification
- `pnpm check` (biome + tsc) clean; `pnpm build` succeeds.
- Existing tests still pass (restore the deleted router smoke test as part of the
  in-flight `/api/v1` cleanup, or track separately).
- Manual walk of each page in light + dark; login → onboarding → feed funnel.
- Stitch fidelity: compare ported React page vs `.stitch/designs/<page>.png`.

## Open items folded into the plan
- The working tree has an unfinished `/api/[[...slugs]]` → `/api/v1/[[...slugs]]`
  move with `router.test.ts` deleted and `authClient` baseURL changed. Resolve
  (commit or revert + restore smoke test) before/as part of this work so the
  tree is clean.
