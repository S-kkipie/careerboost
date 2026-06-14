# SITE.md — CareerBoost / CONECTA UNSA

## 1. Vision
An intelligent, salary-transparent job-opportunity inbox for UNSA graduates. It connects to
the user's Gmail (read-only), de-noises the university job-board flood, and surfaces
personalized matches with explanations. Institutional, trustworthy, Spanish (Peru) UI.
Presentation goal: a polished hackathon demo across the full funnel.

## 2. Stitch project
- **Project ID:** `12329140981897677948`
- Resource: `projects/12329140981897677948`
- Device target: DESKTOP
- Design system: see `.stitch/DESIGN.md` (Section 6 block embedded in every prompt)

## 3. Tech / port notes
- Mockups are ported to **React 19 + Next.js 16 App Router + Tailwind v4 + shadcn/ui**, using
  the live oklch token system (NOT the hex approximations).
- Auth/account surfaces (login form, account settings, user menu) are NOT ported from Stitch
  markup — they use **better-auth-ui** functional components dropped into the Stitch layout.

## 4. Sitemap
- [ ] landing — `/` (public marketing/hero)
- [ ] login — `/auth/[pathname]` (better-auth-ui AuthCard in branded split layout)
- [ ] onboarding — `/onboarding` (3-step wizard)
- [ ] perfil — `/(app)/perfil` (tabs: Perfil profesional + Cuenta)
- [ ] feed — `/(app)/feed` (matches inbox)
- [ ] digest — `/(app)/digest` (Tu digest)

## 5. Roadmap
1. Generate all mockups (landing, login, onboarding, perfil, feed, digest) — Task 5.
2. Port each to React with shadcn primitives — Tasks 6,8,9,11.
3. Drop better-auth-ui into auth/account/nav surfaces — Tasks 7,9,10.

## 6. Creative freedom / ideas (backlog)
- Empty.
