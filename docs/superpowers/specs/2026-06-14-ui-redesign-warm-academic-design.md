# UI Redesign — Warm Academic (Ochre Scholar)

Date: 2026-06-14
Status: Design approved, pending spec review

## Goal

Raise the visual quality of every egresado-facing surface (landing + app
pages) for the hackathon demo by adopting a distinct **Warm Academic** brand
identity. Visual-only: **zero backend, data-model, API, hook, or payload
change.** Dark mode keeps working. No new runtime deps except Google fonts via
`next/font`.

## Locked decisions (from brainstorm)

- **Direction:** B — Warm Academic (university character, navy + warm accent,
  serif display headings).
- **Palette:** B2 — Ochre Scholar (navy primary, golden ochre accent, cream
  background, salary green kept).
- **Typography:** Fraunces (display serif, headings) + Inter (body/UI).
- **Landing structure:** L2 — current sections reskinned **+** new trust strip
  **+** new product showcase (real MatchCard in a browser frame).
- **Auth layout:** AU2 — single centered cream page (wordmark + serif headline
  on top, centered Google card, trust strip below). Replaces current split.

## Implementation approach

**Token-first reskin.** Every component already consumes Tailwind theme tokens
(`--primary`, `--background`, `--border`, …) that resolve to CSS custom
properties in `src/app/globals.css`. Rewriting those property values reskins the
entire app from one place. Then: add fonts, add `--brand`/`--brand-strong`
tokens, and make targeted structural edits only where layout actually changes
(new landing components, auth page, small polish). Rejected: per-component
restyle (slow, inconsistent, high regression) and separate theme + toggle
(no second theme needed).

## Design tokens

Rewrite `:root` and `.dark` in `src/app/globals.css`. Warm-shift the neutrals
(background/card/muted/secondary/accent/border) from pure grey to warm
cream/beige. Add two new brand tokens. `--warning` and `--destructive` stay as
currently defined.

### Light (`:root`)

| Token | Hex | oklch |
|---|---|---|
| `--background` | `#FBF8F1` | `oklch(0.980 0.010 87.5)` |
| `--card` | `#FFFFFF` | `oklch(1 0 0)` |
| `--card-foreground` | `#1B2735` | `oklch(0.268 0.031 252.8)` |
| `--popover` / `--popover-foreground` | = card / card-fg | — |
| `--foreground` | `#1B2735` | `oklch(0.268 0.031 252.8)` |
| `--primary` | `#243B53` | `oklch(0.345 0.051 250.5)` |
| `--primary-foreground` | `#FFFFFF` | `oklch(0.985 0 0)` |
| `--brand` *(new)* | `#B07512` | `oklch(0.609 0.125 72.6)` |
| `--brand-foreground` *(new)* | `#FFFFFF` | `oklch(0.985 0 0)` |
| `--brand-strong` *(new)* | `#8A5A12` | `oklch(0.509 0.103 70.8)` |

> Note: bright `#C8881F` (the brainstorm swatch) is only 2.83:1 on cream —
> fails the 3:1 fill/large-text floor — so `--brand` is nudged to `#B07512`,
> the same ochre family at a passing darkness. `--brand-strong` (`#8A5A12`)
> carries small ochre text (needs 4.5:1).
| `--success` | `#16A34A` | `oklch(0.627 0.170 149.2)` |
| `--success-foreground` | `#FFFFFF` | `oklch(0.985 0 0)` |
| `--muted` | `#F3EAD7` | `oklch(0.939 0.027 85.7)` |
| `--muted-foreground` | `#6B5D4F` | `oklch(0.488 0.028 67.1)` |
| `--secondary` / `--accent` | `#F1E9DC` | `oklch(0.937 0.019 80.1)` |
| `--secondary-foreground` / `--accent-foreground` | `#243B53` | `oklch(0.345 0.051 250.5)` |
| `--border` / `--input` | `#EADFC8` | `oklch(0.906 0.033 85.5)` |
| `--ring` | = `--primary` | `oklch(0.345 0.051 250.5)` |

### Dark (`.dark`)

| Token | Hex | oklch |
|---|---|---|
| `--background` | `#16140F` | `oklch(0.192 0.010 88.8)` |
| `--card` / `--popover` | `#211E17` | `oklch(0.236 0.014 87.6)` |
| `--card-foreground` / `--foreground` | `#F6F0E3` | `oklch(0.956 0.018 86.1)` |
| `--primary` | `#5E84B5` | `oklch(0.605 0.086 255.2)` |
| `--primary-foreground` | `#16140F` | `oklch(0.192 0.010 88.8)` |
| `--brand` *(new)* | `#E0A53A` | `oklch(0.760 0.137 78.4)` |
| `--brand-foreground` *(new)* | `#16140F` | `oklch(0.192 0.010 88.8)` |
| `--brand-strong` *(new)* | = `--brand` | `oklch(0.760 0.137 78.4)` |
| `--success` | `#22C55E` | `oklch(0.723 0.192 149.6)` |
| `--muted` | `#2A261D` | `oklch(0.270 0.017 86.9)` |
| `--muted-foreground` | `#B3A893` | `oklch(0.735 0.032 83.6)` |
| `--secondary` / `--accent` | `#2A261D` | `oklch(0.270 0.017 86.9)` |
| `--border` | `#3A342A` | `oklch(0.328 0.019 80.5)` |
| `--input` | `#3A342A` | `oklch(0.328 0.019 80.5)` |
| `--ring` | `#5E84B5` | `oklch(0.605 0.086 255.2)` |

### `@theme inline` additions

Map the new tokens so Tailwind utilities exist:
`--color-brand: var(--brand)`, `--color-brand-foreground: var(--brand-foreground)`,
`--color-brand-strong: var(--brand-strong)`. This yields `bg-brand`,
`text-brand`, `text-brand-strong`, `border-brand`, `ring-brand`, etc.

## Typography

Add via `next/font/google` in `src/app/layout.tsx`:

- `Inter` → CSS var `--font-sans` (subsets latin, weights 400/500/600).
- `Fraunces` → CSS var `--font-serif` (latin, weights 600/700, optical sizing).

Apply both font CSS vars to `<body>` (className). In `globals.css` `@theme`,
set `--font-sans` as the default sans family and add `--font-serif` so the
`font-serif` utility resolves to Fraunces. Body text inherits Inter; headings
opt into `font-serif`.

**Where serif (`font-serif`) applies:** hero `h1`, landing section `h2`s,
auth/digest/onboarding/perfil page `h1`/`h2`, MatchCard `titulo`, impact-panel
title, stat numbers. **Inter stays for:** all body copy, labels, buttons,
inputs, badges, nav links, chips.

## Accessibility / contrast rules (WCAG AA)

Measured ratios (text needs ≥4.5:1 normal, ≥3:1 large/UI):

| Pair | Ratio | Allowed use |
|---|---|---|
| navy `#243B53` on cream | 10.85 | any text ✓ |
| ink `#1B2735` on cream | 14.26 | any text ✓ |
| white on navy | 11.5 | any text ✓ |
| muted-fg `#6B5D4F` on cream | 5.99 | any text ✓ |
| brand-strong `#8A5A12` on cream | 5.57 | small ochre text ✓ |
| brand `#B07512` on cream | 3.67 | fills + **large** display text + UI ✓ |
| white on brand `#B07512` | 3.89 | large/bold labels on ochre fill ✓ |
| navy on brand `#B07512` | ~3.1 | large/UI only |

**Rules:**
- Ochre `--brand` (`#B07512`) is for **fills, icons, underlines, rings, dots,
  and large display text only** (hero italic accent word, which is ≥30px →
  3.67:1 ✓). Never small ochre body text on light.
- Small ochre text (kickers, labels) uses `--brand-strong` (`text-brand-strong`,
  5.57:1).
- Primary CTAs are **navy** (`bg-primary` + white) — never an ochre fill with
  small white label. Ochre fills only carry large/bold labels, else use the
  ochre as accent (border/underline/icon) with navy/ink text.
- Dark mode: `--brand` is lighter (`#E0A53A`) on dark surfaces; small ochre
  text on dark is high-contrast, so `--brand-strong` = `--brand` there.
- Color never the sole signal (salary badge keeps label text; match badge keeps
  the `%`). Focus rings stay visible. Icon-only buttons keep `aria-label`.
  Decorative icons get `aria-hidden`.

## Shared primitives (new, small)

- `src/frontend/components/ui/kicker.tsx` — uppercase tracked label, always
  `text-brand-strong`, `text-xs`, `font-medium`. (`--brand-strong` = `--brand`
  in dark, so one class works in both modes.) Reused by landing sections,
  digest, perfil, product showcase.
- `src/frontend/components/ui/section-heading.tsx` — serif `h2` + optional
  ochre underline rule (`bg-brand`). Reused by landing sections.

## Landing (`src/app/page.tsx` — auth/redirect logic untouched)

Section order: Nav → Hero → Trust strip → Product showcase → How it works →
Impact band → CTA band → Footer.

- **`landing-nav.tsx`** — serif wordmark "Career" (foreground) + "Boost"
  (`text-brand`); cream/blur bar; ThemeToggle + "Entrar" (primary). Floating
  spacing kept.
- **`hero.tsx`** — serif `h1`, accent word *"sin ruido"* italic `text-brand`
  (large, passes). Inter subhead muted. Primary Google CTA (favicon kept). Warm
  radial + low-opacity sillar dot-grid motif (CSS only). Sub-CTA line: "Acceso
  solo-lectura · sin spam".
- **`trust-strip.tsx`** *(new)* — thin band; 4 inline items, ochre lucide icons
  (`aria-hidden`) + muted Inter text: Lock "solo-lectura", GraduationCap "UNSA",
  Sparkles "IA personalizada", BadgeDollarSign "salario transparente".
- **`product-showcase.tsx`** *(new)* — Kicker + serif heading "Mira tu feed". A
  **static MatchCard mockup inside a browser-chrome frame** (rounded window, 3
  dot controls, cream chrome) using realistic sample data + 2–3 caption bullets.
  Demo centerpiece. The browser-chrome decoration is the one place a literal
  decorative color (window dots) is allowed; everything else uses tokens.
- **`how-it-works.tsx`** — 3 steps, numbered ochre circles (`bg-brand`,
  large/bold number = white ok), serif step titles, icons kept.
- **`impact-band.tsx`** — 3 stat cards on warm muted band; big serif numbers;
  the "90% …" stat stays success-green, others navy; one ochre accent allowed
  on a number if large.
- **`cta-band.tsx`** — navy bg, serif heading, CTA = cream/secondary with navy
  text (not ochre fill).
- **`landing-footer.tsx`** — warm muted, serif wordmark, links, solo-lectura
  note.

## App pages (reskin + polish; all data/hooks/payloads untouched)

- **`app-nav.tsx`** — serif wordmark; ochre active-route indicator
  (underline/border `bg-brand`) on Feed/Digest/Perfil; UserButton + ThemeToggle
  inherit tokens.
- **Feed** (`(app)/feed/page.tsx`):
  - `impact-panel.tsx` — Kicker + serif title; stat numbers serif; layout kept.
  - `filters-bar.tsx` — inherit warm tokens; Switch "on" = ochre. Logic + ALL
    sentinel untouched.
  - `match-card.tsx` — warm card, serif `titulo`, match badge navy + Sparkles,
    salary badge success/muted semantics unchanged, "¿Por qué?" block = ochre
    left-border (`border-brand`) + warm tint. Footer buttons inherit.
  - Upgraded **empty state**: icon + serif line (replaces bare text).
- **Digest** (`(app)/digest/page.tsx`) — Kicker + serif `h1` "Tu digest";
  reuses new MatchCard; upgraded "al día" empty state (icon + serif). "Marcar
  como visto" inherits.
- **Perfil** (`(app)/perfil/page.tsx`) — Tabs styled warm, active tab ochre
  underline. Domain form + `chips-input.tsx` inherit (chip = ochre-tint,
  removable). better-auth-ui `Settings` inherits shadcn tokens. **Payload
  byte-identical, no logic touch.**
- **Onboarding** (`onboarding/page.tsx`, `stepper.tsx`, `step-card.tsx`):
  - `stepper.tsx` — completed = success green, active = ochre ring/dot,
    upcoming = muted; serif labels.
  - `step-card.tsx` — warm card; active border = `border-brand` (ochre); icon
    tile tints by state; CV dropzone hover = ochre. **All gating / hooks /
    step-state derivation untouched** (no pointer-events regression).
- **Auth** (`auth/[pathname]/page.tsx`) — **rewrite to AU2 centered layout:**
  full cream page + low-opacity sillar motif; centered column: serif wordmark
  ("Career" + ochre "Boost"), serif headline "Tu bolsa UNSA, *sin ruido*"
  (italic ochre accent), short Inter subhead; centered `<Auth path={pathname}/>`
  card (max width ~sm) with solo-lectura note; trust strip below
  ("solo-lectura · UNSA · IA"); small "← Volver al inicio" link. Identical
  desktop/mobile (responsive padding). `Auth` props + localization unchanged.

## Motion

- Transitions 150–250ms ease on `color`/`opacity`/`transform` only (no
  layout-shifting hover; no width/height animation).
- Hero + product showcase: gentle CSS fade/translate-in on mount (no JS lib, no
  count-up).
- All motion inside `@media (prefers-reduced-motion: reduce)` guard → disabled.

## Out of scope (YAGNI)

No testimonials, no FAQ, no invented social proof, no count-up animation, no
new data/fields/endpoints/migrations, no backend or auth-logic change, no second
theme, no charts. No new deps beyond `next/font` Google fonts (Fraunces, Inter).

## Testing / verification

No DOM test runner (vitest node env), same as prior UI work.

- `pnpm check` (biome + `tsc --noEmit`) clean. No `any`/`as any`/`as unknown
  as`/`@ts-ignore`/`@ts-expect-error`.
- `pnpm test` — existing 130 tests stay green (pure logic untouched; chips +
  format tests unaffected).
- `pnpm build` passes.
- Manual walk: light **and** dark, breakpoints 375 / 768 / 1024 / 1440, every
  page (landing, auth, onboarding, feed, digest, perfil).
- Grep guard: no hardcoded hex in `src/frontend` components — tokens only —
  except the documented browser-chrome window dots in `product-showcase.tsx`.

## File-level change list

**Edit:** `src/app/globals.css` (tokens + theme + font vars + reduced-motion),
`src/app/layout.tsx` (next/font), `src/app/page.tsx` (add 2 sections),
`src/app/auth/[pathname]/page.tsx` (AU2 rewrite), all
`src/frontend/components/landing/*`, `app-nav.tsx`, `theme-toggle.tsx` (only if
needed), `src/frontend/components/feed/*`, `src/frontend/components/onboarding/*`,
`(app)/feed/page.tsx`, `(app)/digest/page.tsx`, `(app)/perfil/page.tsx`,
`onboarding/page.tsx`.

**New:** `src/frontend/components/landing/trust-strip.tsx`,
`src/frontend/components/landing/product-showcase.tsx`,
`src/frontend/components/ui/kicker.tsx`,
`src/frontend/components/ui/section-heading.tsx`.

**Unchanged:** all of `src/server/**`, `src/frontend/hooks/**`,
`src/frontend/lib/format.ts`, `src/frontend/lib/chips.ts`, all routers, schema,
migrations, eden/treaty clients, better-auth-ui localization + providers.
