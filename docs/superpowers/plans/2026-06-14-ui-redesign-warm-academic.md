# Warm Academic UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire egresado-facing UI (landing + auth + all app pages) to a "Warm Academic / Ochre Scholar" brand identity — visual-only, zero backend/data-model/hook/payload change.

**Architecture:** Token-first reskin. All components already consume Tailwind theme tokens that resolve to CSS custom properties in `src/app/globals.css`. Rewriting those property values reskins the whole app at once. Then: add fonts (`next/font`), add `--brand`/`--brand-strong` ochre tokens, and make surgical edits (serif headings via `font-serif`, ochre accents via `bg-brand`/`text-brand`/`text-brand-strong`), plus a few new components (trust strip, product showcase, kicker, section heading, empty state) and an auth-page rewrite.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme` + oklch tokens, no config file), shadcn/ui (cva primitives), better-auth-ui, next-themes, next/font (Inter + Fraunces), lucide-react, `cn()` helper.

**Spec:** `docs/superpowers/specs/2026-06-14-ui-redesign-warm-academic-design.md`

**Branch:** `ui-redesign-warm-academic` (already created; spec already committed at `3af8d1f`).

**Verification model:** No DOM test runner (vitest is node env). Per task: `pnpm check` (biome + `tsc --noEmit`). At milestones: `pnpm build` and `pnpm test` (existing 130 logic tests must stay green — no logic is touched). No `any`/`as any`/`as unknown as`/`@ts-ignore`/`@ts-expect-error`. No hardcoded hex in `src/frontend` except the documented browser-chrome window dots in `product-showcase.tsx`.

---

## File Structure

**Rewritten (full new content given):**
- `src/app/globals.css` — tokens, brand tokens, font + color theme mappings, `.sillar-grid`, rise animation, reduced-motion guard.
- `src/app/layout.tsx` — Inter + Fraunces via `next/font`.
- `src/app/auth/[pathname]/page.tsx` — AU2 centered layout.
- `src/frontend/components/app-nav.tsx` — active-route ochre indicator + serif wordmark.
- `src/frontend/components/onboarding/stepper.tsx` — ochre active state.

**New files:**
- `src/frontend/components/ui/empty.tsx` — installed via shadcn CLI (`shadcn add empty`), not hand-written.
- `src/frontend/components/ui/kicker.tsx` — thin local composition (no shadcn equivalent).
- `src/frontend/components/ui/section-heading.tsx` — thin local composition (no shadcn equivalent).
- `src/frontend/components/landing/trust-strip.tsx`
- `src/frontend/components/landing/product-showcase.tsx`

**shadcn-first rule:** prefer official shadcn registry components installed via
the CLI over hand-rolling. Empty states use shadcn `empty`. Kicker /
SectionHeading have no registry equivalent, so they remain thin local
compositions over existing tokens/elements.

**Surgical edits (exact old→new blocks given):**
- `src/frontend/components/landing/{landing-nav,hero,how-it-works,impact-band,cta-band,landing-footer}.tsx`
- `src/app/page.tsx`
- `src/frontend/components/feed/{match-card,impact-panel,filters-bar}.tsx`
- `src/app/(app)/feed/page.tsx`, `src/app/(app)/digest/page.tsx`, `src/app/(app)/perfil/page.tsx`
- `src/app/onboarding/page.tsx`, `src/frontend/components/onboarding/step-card.tsx`
- `src/frontend/components/profile/chips-input.tsx`

**Untouched:** all `src/server/**`, `src/frontend/hooks/**`, `src/frontend/lib/{format,chips}.ts`, routers, schema, migrations, eden/treaty, better-auth-ui registry components + localization + providers.

---

## Task 1: Design tokens + motion (globals.css)

**Files:**
- Rewrite: `src/app/globals.css`

- [ ] **Step 1: Replace `src/app/globals.css` with the full content below**

```css
@import "tailwindcss";

@theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-destructive-foreground: var(--destructive-foreground);
    --color-success: var(--success);
    --color-success-foreground: var(--success-foreground);
    --color-warning: var(--warning);
    --color-warning-foreground: var(--warning-foreground);
    --color-brand: var(--brand);
    --color-brand-foreground: var(--brand-foreground);
    --color-brand-strong: var(--brand-strong);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --font-sans: var(--font-inter);
    --font-serif: var(--font-fraunces);
}

:root {
    --radius: 0.625rem;
    --background: oklch(0.980 0.010 87.5);
    --foreground: oklch(0.268 0.031 252.8);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.268 0.031 252.8);
    --primary: oklch(0.345 0.051 250.5);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.937 0.019 80.1);
    --secondary-foreground: oklch(0.345 0.051 250.5);
    --muted: oklch(0.939 0.027 85.7);
    --muted-foreground: oklch(0.488 0.028 67.1);
    --accent: oklch(0.937 0.019 80.1);
    --accent-foreground: oklch(0.345 0.051 250.5);
    --destructive: oklch(0.577 0.245 27.325);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.627 0.170 149.2);
    --success-foreground: oklch(0.985 0 0);
    --warning: oklch(0.75 0.16 80);
    --warning-foreground: oklch(0.205 0 0);
    --brand: oklch(0.609 0.125 72.6);
    --brand-foreground: oklch(0.985 0 0);
    --brand-strong: oklch(0.509 0.103 70.8);
    --border: oklch(0.906 0.033 85.5);
    --input: oklch(0.906 0.033 85.5);
    --ring: oklch(0.345 0.051 250.5);
}

.dark {
    --background: oklch(0.192 0.010 88.8);
    --foreground: oklch(0.956 0.018 86.1);
    --card: oklch(0.236 0.014 87.6);
    --card-foreground: oklch(0.956 0.018 86.1);
    --primary: oklch(0.605 0.086 255.2);
    --primary-foreground: oklch(0.192 0.010 88.8);
    --secondary: oklch(0.270 0.017 86.9);
    --secondary-foreground: oklch(0.956 0.018 86.1);
    --muted: oklch(0.270 0.017 86.9);
    --muted-foreground: oklch(0.735 0.032 83.6);
    --accent: oklch(0.270 0.017 86.9);
    --accent-foreground: oklch(0.956 0.018 86.1);
    --destructive: oklch(0.704 0.191 22.216);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.723 0.192 149.6);
    --success-foreground: oklch(0.192 0.010 88.8);
    --warning: oklch(0.78 0.16 80);
    --warning-foreground: oklch(0.985 0 0);
    --brand: oklch(0.760 0.137 78.4);
    --brand-foreground: oklch(0.192 0.010 88.8);
    --brand-strong: oklch(0.760 0.137 78.4);
    --border: oklch(0.328 0.019 80.5);
    --input: oklch(0.328 0.019 80.5);
    --ring: oklch(0.605 0.086 255.2);
}

* {
    border-color: var(--border);
}
body {
    background-color: var(--background);
    color: var(--foreground);
}

/* Subtle sillar (Arequipa stone) dot-grid motif — used in hero + auth panel */
.sillar-grid {
    background-image: radial-gradient(var(--border) 1px, transparent 1px);
    background-size: 16px 16px;
}

/* Gentle mount entrance for hero + product showcase */
@keyframes rise {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
.animate-rise {
    animation: rise 0.5s ease both;
}

@media (prefers-reduced-motion: reduce) {
    .animate-rise {
        animation: none;
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm check`
Expected: PASS (biome + tsc clean). CSS is not type-checked; this confirms nothing else broke.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(ui): warm academic design tokens + brand + motion"
```

---

## Task 2: Fonts — Inter + Fraunces (layout.tsx)

**Files:**
- Rewrite: `src/app/layout.tsx`

- [ ] **Step 1: Replace `src/app/layout.tsx` with the full content below**

```tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import Providers from "@/frontend/providers/providers";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
    weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
    subsets: ["latin"],
    variable: "--font-fraunces",
    display: "swap",
    weight: ["600", "700"],
    style: ["normal", "italic"],
});

export const metadata: Metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={`${inter.variable} ${fraunces.variable} font-sans`}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
```

- [ ] **Step 2: Verify type + lint**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Verify build (fonts fetch + compile)**

Run: `pnpm build`
Expected: build succeeds; no "Failed to fetch font" error. (`next/font` downloads Inter + Fraunces at build time.)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "style(ui): load Inter (body) + Fraunces (display) via next/font"
```

---

## Task 3: Shared primitives (shadcn empty + kicker + section-heading)

**Files:**
- Create (via shadcn CLI): `src/frontend/components/ui/empty.tsx`
- Create: `src/frontend/components/ui/kicker.tsx`
- Create: `src/frontend/components/ui/section-heading.tsx`

- [ ] **Step 0: Install the shadcn `empty` component**

Run: `pnpm dlx shadcn@latest add empty`
Expected: writes `src/frontend/components/ui/empty.tsx` (per `components.json` ui
alias) exporting `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`,
`EmptyDescription`, `EmptyContent`. If the CLI prompts to overwrite/confirm,
accept defaults. Verify the file exists and `pnpm check` stays clean before
continuing. (If the registry has no `empty` block in this CLI version, STOP and
report — do not hand-roll without confirming.)

- [ ] **Step 1: Create `src/frontend/components/ui/kicker.tsx`**

```tsx
import type * as React from "react";

import { cn } from "@/frontend/lib/utils";

// Small uppercase ochre label. Uses --brand-strong (= --brand in dark) so a
// single class passes contrast in both modes.
export function Kicker({
    className,
    ...props
}: React.ComponentProps<"p">) {
    return (
        <p
            className={cn(
                "text-xs font-medium uppercase tracking-[0.12em] text-brand-strong",
                className,
            )}
            {...props}
        />
    );
}
```

- [ ] **Step 2: Create `src/frontend/components/ui/section-heading.tsx`**

```tsx
import type * as React from "react";

import { cn } from "@/frontend/lib/utils";
import { Kicker } from "@/frontend/components/ui/kicker";

interface SectionHeadingProps {
    kicker?: string;
    title: React.ReactNode;
    align?: "center" | "left";
    className?: string;
}

// Serif section title + optional kicker + ochre underline rule.
export function SectionHeading({
    kicker,
    title,
    align = "center",
    className,
}: SectionHeadingProps) {
    return (
        <div
            className={cn(
                align === "center" ? "text-center" : "text-left",
                className,
            )}
        >
            {kicker ? <Kicker className="mb-2">{kicker}</Kicker> : null}
            <h2 className="font-serif text-3xl font-semibold text-foreground">
                {title}
            </h2>
            <div
                className={cn(
                    "mt-4 h-1 w-16 rounded-full bg-brand",
                    align === "center" && "mx-auto",
                )}
            />
        </div>
    );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/ui/empty.tsx src/frontend/components/ui/kicker.tsx src/frontend/components/ui/section-heading.tsx components.json
git commit -m "feat(ui): add shadcn empty component + Kicker/SectionHeading compositions"
```

---

## Task 4: Landing nav + hero

**Files:**
- Modify: `src/frontend/components/landing/landing-nav.tsx`
- Modify: `src/frontend/components/landing/hero.tsx`

- [ ] **Step 1: Update the wordmark in `landing-nav.tsx`**

Replace:

```tsx
            <span className="text-xl font-bold text-primary">CareerBoost</span>
```

with:

```tsx
            <span className="font-serif text-xl font-bold text-foreground">
                Career<span className="text-brand">Boost</span>
            </span>
```

- [ ] **Step 2: Replace the `<section>` body of `hero.tsx`**

Replace the entire returned JSX (from `<section ...>` to `</section>`) with:

```tsx
        <section className="relative flex min-h-[716px] flex-col items-center justify-center overflow-hidden px-5 py-16 md:px-12 text-center">
            {/* Sillar dot-grid motif + warm radial glow */}
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="sillar-grid absolute inset-0 opacity-40" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,var(--color-brand)_0%,transparent_55%)] opacity-[0.06]" />
            </div>

            <div className="mx-auto w-full max-w-[1100px] animate-rise space-y-4">
                <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground md:text-5xl md:leading-tight">
                    Tu bolsa de trabajo UNSA,{" "}
                    <span className="text-brand italic">sin ruido</span>
                </h1>
                <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                    Recibe oportunidades laborales personalizadas con
                    transparencia salarial directamente desde tu Gmail{" "}
                    <span className="font-medium">(acceso solo-lectura)</span>.
                </p>
                <div className="pt-6">
                    <Link
                        href="/auth/sign-in"
                        className={cn(
                            buttonVariants({ size: "lg" }),
                            "gap-3 px-8 py-4 text-base",
                        )}
                    >
                        <Image
                            src="https://www.google.com/favicon.ico"
                            alt="Google"
                            className="size-5 rounded-sm"
                            width={20}
                            height={20}
                            unoptimized
                        />
                        Continuar con Google
                    </Link>
                </div>
                <p className="text-sm text-muted-foreground">
                    Acceso solo-lectura · sin spam
                </p>
            </div>
        </section>
```

(Imports `Image`, `Link`, `buttonVariants`, `cn` are already present — unchanged.)

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/landing/landing-nav.tsx src/frontend/components/landing/hero.tsx
git commit -m "style(landing): warm academic nav + hero (serif, ochre accent, sillar motif)"
```

---

## Task 5: Trust strip + product showcase (new) + wire into landing

**Files:**
- Create: `src/frontend/components/landing/trust-strip.tsx`
- Create: `src/frontend/components/landing/product-showcase.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/frontend/components/landing/trust-strip.tsx`**

```tsx
import {
    BadgeDollarSign,
    GraduationCap,
    Lock,
    type LucideIcon,
    Sparkles,
} from "lucide-react";

interface TrustItem {
    icon: LucideIcon;
    label: string;
}

const items: TrustItem[] = [
    { icon: Lock, label: "Acceso solo-lectura" },
    { icon: GraduationCap, label: "Hecho para la UNSA" },
    { icon: Sparkles, label: "IA personalizada" },
    { icon: BadgeDollarSign, label: "Salario transparente" },
];

export function TrustStrip() {
    return (
        <section className="border-y border-border bg-muted/50 py-6">
            <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 md:px-12">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div
                            key={item.label}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Icon
                                className="size-4 text-brand"
                                aria-hidden="true"
                            />
                            {item.label}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
```

- [ ] **Step 2: Create `src/frontend/components/landing/product-showcase.tsx`**

```tsx
import { MatchCard, type MatchCardItem } from "@/frontend/components/feed/match-card";
import { SectionHeading } from "@/frontend/components/ui/section-heading";

// Static sample used only for the landing visual. Not wired to any data.
const SAMPLE: MatchCardItem = {
    id: "sample",
    rerank_score: 92,
    explanation:
        "Tu experiencia en Python y SQL encaja con los requisitos; el salario está dentro de tu expectativa.",
    status: "new",
    job: {
        titulo: "Analista de Datos Junior",
        empresa: "Gobierno Regional de Arequipa",
        modalidad: "hibrido",
        ubicacion: "Arequipa",
        salario_min: 2500,
        salario_max: 3500,
        moneda: "PEN",
        salario_periodo: "mensual",
        salario_explicito: true,
        apply_link: "#",
    },
};

const captions = [
    "Cada match explica por qué encajas.",
    "Mostramos el salario que otros ocultan.",
    "Un clic para postular, sin rastrear tu bandeja.",
];

export function ProductShowcase() {
    return (
        <section className="px-5 py-16 md:px-12">
            <div className="mx-auto max-w-[1100px]">
                <SectionHeading kicker="Tu feed" title="Mira lo que recibes" />

                <div className="mt-12 grid items-center gap-10 md:grid-cols-2">
                    {/* Browser-chrome frame around a real MatchCard (visual only) */}
                    <div className="animate-rise overflow-hidden rounded-xl border border-border shadow-lg">
                        <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-3">
                            {/* decorative window dots — the one allowed literal-colour spot */}
                            <span className="size-2.5 rounded-full bg-[#ef4444]" />
                            <span className="size-2.5 rounded-full bg-[#eab308]" />
                            <span className="size-2.5 rounded-full bg-[#22c55e]" />
                        </div>
                        <div
                            className="pointer-events-none select-none bg-background p-4"
                            aria-hidden="true"
                        >
                            <MatchCard
                                item={SAMPLE}
                                isPending={false}
                                onSave={() => {}}
                                onDismiss={() => {}}
                            />
                        </div>
                    </div>

                    <ul className="flex flex-col gap-4">
                        {captions.map((caption) => (
                            <li
                                key={caption}
                                className="flex items-start gap-3 text-foreground"
                            >
                                <span
                                    className="mt-2 size-2 shrink-0 rounded-full bg-brand"
                                    aria-hidden="true"
                                />
                                <span className="text-base text-muted-foreground">
                                    {caption}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}
```

- [ ] **Step 3: Wire both into `src/app/page.tsx`**

Replace the import block for landing components and the `<main>` body. Replace:

```tsx
import { CtaBand } from "@/frontend/components/landing/cta-band";
import { Hero } from "@/frontend/components/landing/hero";
import { HowItWorks } from "@/frontend/components/landing/how-it-works";
import { ImpactBand } from "@/frontend/components/landing/impact-band";
import { LandingFooter } from "@/frontend/components/landing/landing-footer";
import { LandingNav } from "@/frontend/components/landing/landing-nav";
```

with:

```tsx
import { CtaBand } from "@/frontend/components/landing/cta-band";
import { Hero } from "@/frontend/components/landing/hero";
import { HowItWorks } from "@/frontend/components/landing/how-it-works";
import { ImpactBand } from "@/frontend/components/landing/impact-band";
import { LandingFooter } from "@/frontend/components/landing/landing-footer";
import { LandingNav } from "@/frontend/components/landing/landing-nav";
import { ProductShowcase } from "@/frontend/components/landing/product-showcase";
import { TrustStrip } from "@/frontend/components/landing/trust-strip";
```

And replace:

```tsx
            <main className="pt-16">
                <Hero />
                <ImpactBand />
                <HowItWorks />
                <CtaBand />
            </main>
```

with:

```tsx
            <main className="pt-16">
                <Hero />
                <TrustStrip />
                <ProductShowcase />
                <HowItWorks />
                <ImpactBand />
                <CtaBand />
            </main>
```

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/landing/trust-strip.tsx src/frontend/components/landing/product-showcase.tsx src/app/page.tsx
git commit -m "feat(landing): add trust strip + product showcase sections (L2)"
```

---

## Task 6: How-it-works + impact-band + cta-band + footer

**Files:**
- Modify: `src/frontend/components/landing/how-it-works.tsx`
- Modify: `src/frontend/components/landing/impact-band.tsx`
- Modify: `src/frontend/components/landing/cta-band.tsx`
- Modify: `src/frontend/components/landing/landing-footer.tsx`

- [ ] **Step 1: `how-it-works.tsx` — use SectionHeading, ochre numbered circles, serif step titles**

Add import at top:

```tsx
import { SectionHeading } from "@/frontend/components/ui/section-heading";
```

Replace the heading block:

```tsx
                <div className="mb-12 text-center">
                    <h2 className="text-3xl font-semibold text-foreground">
                        Cómo funciona
                    </h2>
                    <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-primary" />
                </div>
```

with:

```tsx
                <SectionHeading
                    kicker="En 3 pasos"
                    title="Cómo funciona"
                    className="mb-12"
                />
```

Then replace the icon circle + title:

```tsx
                                <div className="flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                                    <Icon className="size-8 text-primary" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">
                                    {step.title}
                                </h3>
```

with:

```tsx
                                <div className="flex size-16 items-center justify-center rounded-full border border-brand/20 bg-brand/10">
                                    <Icon className="size-8 text-brand" aria-hidden="true" />
                                </div>
                                <h3 className="font-serif text-lg font-semibold text-foreground">
                                    {step.title}
                                </h3>
```

- [ ] **Step 2: `impact-band.tsx` — serif stat numbers, keep success-green stat**

Replace the stat `color` values so the salary stat stays green and the others use brand:

```tsx
const stats = [
    {
        value: "100+",
        label: "correos/mes procesados",
        color: "text-primary",
    },
    {
        value: "27%",
        label: "ruido eliminado de tu bandeja",
        color: "text-brand",
    },
    {
        value: "90%",
        label: "sin salario visible → lo mostramos",
        color: "text-success",
    },
] as const;
```

And make the number serif — replace:

```tsx
                            <div className={`text-4xl font-bold ${stat.color}`}>
```

with:

```tsx
                            <div className={`font-serif text-4xl font-bold ${stat.color}`}>
```

And switch card hover accent from primary to brand — replace:

```tsx
                            className="items-center justify-center p-8 text-center gap-2 hover:border-primary transition-colors"
```

with:

```tsx
                            className="items-center justify-center p-8 text-center gap-2 hover:border-brand transition-colors"
```

- [ ] **Step 3: `cta-band.tsx` — serif heading (CTA stays cream/secondary, navy text → accessible)**

Replace:

```tsx
                <h2 className="text-3xl font-semibold">
                    ¿Listo para impulsar tu carrera?
                </h2>
```

with:

```tsx
                <h2 className="font-serif text-3xl font-semibold">
                    ¿Listo para impulsar tu carrera?
                </h2>
```

(The CTA button already uses `variant="secondary"` → cream bg + navy text on the navy band; white-on-navy heading = 11.5:1. No ochre fill here, so no contrast issue.)

- [ ] **Step 4: `landing-footer.tsx` — serif wordmark**

Replace:

```tsx
                <div className="text-lg font-bold text-foreground">
                    CareerBoost UNSA
                </div>
```

with:

```tsx
                <div className="font-serif text-lg font-bold text-foreground">
                    Career<span className="text-brand">Boost</span> UNSA
                </div>
```

- [ ] **Step 5: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/landing/how-it-works.tsx src/frontend/components/landing/impact-band.tsx src/frontend/components/landing/cta-band.tsx src/frontend/components/landing/landing-footer.tsx
git commit -m "style(landing): serif headings + ochre accents across remaining sections"
```

---

## Task 7: App nav — active-route ochre indicator + serif wordmark

**Files:**
- Rewrite: `src/frontend/components/app-nav.tsx`

- [ ] **Step 1: Replace `src/frontend/components/app-nav.tsx` with the full content below**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@/frontend/components/auth/user/user-button";
import { ThemeToggle } from "@/frontend/components/theme-toggle";
import { cn } from "@/frontend/lib/utils";

const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/digest", label: "Tu digest" },
];

export function AppNav() {
    const pathname = usePathname();

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
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    active
                                        ? "text-brand-strong"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {link.label}
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

- [ ] **Step 2: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/components/app-nav.tsx
git commit -m "style(nav): serif wordmark + ochre active-route indicator"
```

---

## Task 8: Match card — serif title + ochre "¿Por qué?" accent

**Files:**
- Modify: `src/frontend/components/feed/match-card.tsx`

- [ ] **Step 1: Serif job title**

Replace:

```tsx
                        <h3 className="font-semibold text-foreground leading-snug">
                            {item.job.titulo}
                        </h3>
```

with:

```tsx
                        <h3 className="font-serif font-semibold text-foreground leading-snug">
                            {item.job.titulo}
                        </h3>
```

- [ ] **Step 2: Ochre accent on the explanation block**

Replace:

```tsx
                    <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-sm">
```

with:

```tsx
                    <div className="rounded-md border-l-2 border-brand bg-brand/5 px-3 py-2 text-sm">
```

(Salary badge, match badge, modalidad/ubicacion icons, footer buttons all keep their token-driven styling — semantics unchanged.)

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/feed/match-card.tsx
git commit -m "style(feed): serif match-card title + ochre rationale accent"
```

---

## Task 9: Feed page — impact panel, filters switch, empty state

**Files:**
- Modify: `src/frontend/components/feed/impact-panel.tsx`
- Modify: `src/frontend/components/feed/filters-bar.tsx`
- Modify: `src/app/(app)/feed/page.tsx`

- [ ] **Step 1: `impact-panel.tsx` — kicker + serif title + serif numbers**

Add import:

```tsx
import { Kicker } from "@/frontend/components/ui/kicker";
```

Replace the header:

```tsx
            <CardHeader>
                <CardTitle>Impacto de tu perfil</CardTitle>
            </CardHeader>
```

with:

```tsx
            <CardHeader>
                <Kicker>Tu impacto</Kicker>
                <CardTitle className="font-serif">
                    Impacto de tu perfil
                </CardTitle>
            </CardHeader>
```

Replace the stat number:

```tsx
                            <p className="font-bold text-2xl text-primary">
                                {stat.value}
                            </p>
```

with:

```tsx
                            <p className="font-serif font-bold text-2xl text-primary">
                                {stat.value}
                            </p>
```

- [ ] **Step 2: `filters-bar.tsx` — ochre "on" switch**

Replace:

```tsx
                <Switch
                    id="solo-con-salario"
                    checked={soloConSalario}
                    onCheckedChange={onSoloConSalarioChange}
                    size="sm"
                />
```

with:

```tsx
                <Switch
                    id="solo-con-salario"
                    checked={soloConSalario}
                    onCheckedChange={onSoloConSalarioChange}
                    size="sm"
                    className="data-[state=checked]:bg-brand"
                />
```

- [ ] **Step 3: `(app)/feed/page.tsx` — upgrade the empty state (shadcn `Empty`)**

Add imports:

```tsx
import { SearchX } from "lucide-react";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
```

Replace:

```tsx
    } else if (matches.length === 0) {
        feedSection = (
            <p className="text-muted-foreground text-sm">
                No hay vacantes que coincidan. Ajusta los filtros o sincroniza
                de nuevo.
            </p>
        );
    } else {
```

with:

```tsx
    } else if (matches.length === 0) {
        feedSection = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <SearchX />
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
```

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/feed/impact-panel.tsx src/frontend/components/feed/filters-bar.tsx "src/app/(app)/feed/page.tsx"
git commit -m "style(feed): kicker + serif impact panel, ochre switch, friendly empty state"
```

---

## Task 10: Digest page — kicker + serif header + empty state

**Files:**
- Modify: `src/app/(app)/digest/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/frontend/components/ui/empty";
import { Kicker } from "@/frontend/components/ui/kicker";
```

(Replace the existing `import { CheckCircle2 } from "lucide-react";` line with the `CalendarCheck, CheckCircle2` version above.)

- [ ] **Step 2: Upgrade empty state (shadcn `Empty`)**

Replace:

```tsx
    } else if (matches.length === 0) {
        body = (
            <p className="text-muted-foreground text-sm">
                Estás al día. No hay nuevas oportunidades por ahora.
            </p>
        );
    } else {
```

with:

```tsx
    } else if (matches.length === 0) {
        body = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-brand/10 text-brand"
                    >
                        <CalendarCheck />
                    </EmptyMedia>
                    <EmptyTitle className="font-serif">
                        Estás al día
                    </EmptyTitle>
                    <EmptyDescription>
                        No hay nuevas oportunidades por ahora. Te avisaremos.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    } else {
```

- [ ] **Step 3: Kicker + serif heading**

Replace:

```tsx
            <div>
                <h1 className="font-bold text-foreground text-2xl">
                    Tu digest
                </h1>
                <p className="mt-1 font-medium text-primary text-sm">
                    Tus mejores oportunidades de hoy
                </p>
```

with:

```tsx
            <div>
                <Kicker>Resumen diario</Kicker>
                <h1 className="font-serif font-bold text-foreground text-2xl">
                    Tu digest
                </h1>
                <p className="mt-1 font-medium text-brand-strong text-sm">
                    Tus mejores oportunidades de hoy
                </p>
```

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/digest/page.tsx"
git commit -m "style(digest): kicker + serif header, friendly empty state"
```

---

## Task 11: Perfil page — ochre tab underline + serif card titles; chip ochre tint

**Files:**
- Modify: `src/app/(app)/perfil/page.tsx`
- Modify: `src/frontend/components/profile/chips-input.tsx`

- [ ] **Step 1: `perfil/page.tsx` — line-variant tabs with ochre underline**

Replace:

```tsx
            <TabsList>
                <TabsTrigger value="perfil">Perfil profesional</TabsTrigger>
                <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
            </TabsList>
```

with:

```tsx
            <TabsList variant="line">
                <TabsTrigger
                    value="perfil"
                    className="data-[state=active]:after:bg-brand data-[state=active]:text-foreground"
                >
                    Perfil profesional
                </TabsTrigger>
                <TabsTrigger
                    value="cuenta"
                    className="data-[state=active]:after:bg-brand data-[state=active]:text-foreground"
                >
                    Cuenta
                </TabsTrigger>
            </TabsList>
```

- [ ] **Step 2: `perfil/page.tsx` — serif card titles**

There are three `<CardTitle>` elements (`Académico`, `Profesional`, `Preferencias`). Add `className="font-serif"` to each:

Replace `<CardTitle>Académico</CardTitle>` with `<CardTitle className="font-serif">Académico</CardTitle>`.
Replace `<CardTitle>Profesional</CardTitle>` with `<CardTitle className="font-serif">Profesional</CardTitle>`.
Replace `<CardTitle>Preferencias</CardTitle>` with `<CardTitle className="font-serif">Preferencias</CardTitle>`.

- [ ] **Step 3: `chips-input.tsx` — ochre-tinted chips**

Replace:

```tsx
                        variant="secondary"
                        className="gap-1"
```

with:

```tsx
                        variant="secondary"
                        className="gap-1 border-brand/20 bg-brand/10 text-brand-strong"
```

(The remove `<button>` keeps `type="button"` and its `aria-label` — unchanged. Chip add/remove logic via `addChip` untouched.)

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/perfil/page.tsx" src/frontend/components/profile/chips-input.tsx
git commit -m "style(perfil): ochre tab underline + serif card titles + ochre chips"
```

---

## Task 12: Onboarding — stepper, step-card, page header & dropzone

**Files:**
- Rewrite: `src/frontend/components/onboarding/stepper.tsx`
- Modify: `src/frontend/components/onboarding/step-card.tsx`
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace `src/frontend/components/onboarding/stepper.tsx` with the full content below**

(`completed` = success green, `active` = ochre fill + ring, `upcoming` = muted; serif labels. Step-state logic lives in `onboarding/page.tsx` and is NOT changed.)

```tsx
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/frontend/lib/utils";

export type StepState = "completed" | "active" | "upcoming";

export interface Step {
    label: string;
    state: StepState;
}

interface StepperProps {
    steps: Step[];
}

export function Stepper({ steps }: StepperProps) {
    return (
        <div className="flex items-center justify-between relative px-2">
            {/* connector line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-10" />
            {steps.map((step, i) => (
                <div
                    key={step.label}
                    className="flex flex-col items-center bg-background px-2"
                >
                    <div
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center border-4 border-background shadow-sm",
                            step.state === "completed" &&
                                "bg-success text-success-foreground",
                            step.state === "active" &&
                                "bg-brand text-brand-foreground ring-2 ring-brand ring-offset-2 ring-offset-background",
                            step.state === "upcoming" &&
                                "bg-muted text-muted-foreground",
                        )}
                    >
                        {step.state === "completed" ? (
                            <CheckCircle2 className="size-5" />
                        ) : (
                            <span className="text-sm font-bold">{i + 1}</span>
                        )}
                    </div>
                    <span
                        className={cn(
                            "font-serif text-xs font-semibold tracking-wide mt-2",
                            step.state === "completed" && "text-success",
                            step.state === "active" && "text-foreground",
                            step.state === "upcoming" &&
                                "text-muted-foreground",
                        )}
                    >
                        {step.label}
                    </span>
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: `step-card.tsx` — ochre active border + ochre active icon tile**

Replace:

```tsx
                state === "active" && "border-2 border-primary shadow-md",
```

with:

```tsx
                state === "active" && "border-2 border-brand shadow-md",
```

And replace:

```tsx
                            state === "active" && "bg-primary/10 text-primary",
```

with:

```tsx
                            state === "active" && "bg-brand/10 text-brand",
```

- [ ] **Step 3: `onboarding/page.tsx` — serif title + ochre dropzone hover**

Replace:

```tsx
                <h1 className="font-bold text-2xl text-foreground">
                    Configura tu cuenta
                </h1>
```

with:

```tsx
                <h1 className="font-serif font-bold text-2xl text-foreground">
                    Configura tu cuenta
                </h1>
```

And replace the dropzone hover classes:

```tsx
                                    : "cursor-pointer hover:border-primary hover:bg-primary/5",
```

with:

```tsx
                                    : "cursor-pointer hover:border-brand hover:bg-brand/5",
```

(All gating, hooks, mutation calls, and the `step1State`/`step2State`/`step3State` derivation stay exactly as-is. No `pointer-events-none` added.)

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/onboarding/stepper.tsx src/frontend/components/onboarding/step-card.tsx src/app/onboarding/page.tsx
git commit -m "style(onboarding): ochre stepper/step-card active state + serif headings"
```

---

## Task 13: Auth page — AU2 centered layout

**Files:**
- Rewrite: `src/app/auth/[pathname]/page.tsx`

- [ ] **Step 1: Replace `src/app/auth/[pathname]/page.tsx` with the full content below**

```tsx
import Link from "next/link";

import { Auth } from "@/frontend/components/auth/auth";

export default async function AuthPage({
    params,
}: {
    params: Promise<{ pathname: string }>;
}) {
    const { pathname } = await params;

    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
            {/* Sillar dot-grid motif */}
            <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="sillar-grid absolute inset-0 opacity-40" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,var(--color-brand)_0%,transparent_55%)] opacity-[0.06]" />
            </div>

            <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
                <Link
                    href="/"
                    className="font-serif text-2xl font-bold tracking-tight text-foreground"
                >
                    Career<span className="text-brand">Boost</span>
                </Link>

                <h1 className="font-serif text-3xl font-bold leading-tight text-foreground">
                    Tu bolsa UNSA,{" "}
                    <span className="text-brand italic">sin ruido</span>
                </h1>
                <p className="-mt-2 text-muted-foreground">
                    Entra con tu cuenta Google para ver tus matches.
                </p>

                <div className="w-full">
                    <Auth path={pathname} />
                </div>

                <p className="text-xs text-muted-foreground">
                    Acceso solo-lectura · UNSA · IA personalizada
                </p>

                <Link
                    href="/"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    ← Volver al inicio
                </Link>
            </div>
        </main>
    );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/auth/[pathname]/page.tsx"
git commit -m "style(auth): AU2 centered warm-academic auth layout"
```

---

## Task 14: Final verification pass

**Files:** none (verification + optional nit fixes only)

- [ ] **Step 1: Type + lint**

Run: `pnpm check`
Expected: PASS (biome + tsc clean).

- [ ] **Step 2: Tests (logic unchanged — must stay green)**

Run: `pnpm test`
Expected: all 130 pass.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds (fonts fetched, all routes compile).

- [ ] **Step 4: Guard — no stray hardcoded hex in components**

Run: `grep -rnE "#[0-9a-fA-F]{3,8}" src/frontend src/app --include="*.tsx"`
Expected: ONLY the three documented browser-chrome window dots in `product-showcase.tsx` (`#ef4444`, `#eab308`, `#22c55e`). Anything else → convert to a token.

- [ ] **Step 5: Guard — no type suppression introduced**

Run: `grep -rnE "as any|as unknown as|@ts-ignore|@ts-expect-error|: any" src/frontend src/app --include="*.tsx"`
Expected: no matches.

- [ ] **Step 6: Manual walk (human)**

Check in browser, light **and** dark, at widths 375 / 768 / 1024 / 1440:
- Landing: hero serif + ochre italic word, sillar motif subtle, trust strip, product showcase MatchCard inside browser frame, how-it-works ochre circles, impact stats (salary stat green), CTA band, footer.
- Auth (`/auth/sign-in`): centered, wordmark, serif headline, Google card, trust line, back link.
- Onboarding: stepper colors per state, active card ochre border, CV dropzone still clickable at every step (no pointer-events regression), buttons gate via `disabled` only.
- Feed: impact panel, ochre filter switch, match cards, empty state (toggle filters to force zero).
- Digest: header + empty state.
- Perfil: ochre tab underline, serif card titles, ochre chips add/remove, Cuenta tab (better-auth-ui Settings).

- [ ] **Step 7: Commit any nit fixes found**

```bash
git add -A
git commit -m "style(ui): final warm-academic polish nits"
```

(Skip if nothing changed.)

---

## Self-Review (completed during planning)

- **Spec coverage:** tokens (T1), fonts (T2), shadcn `empty` + kicker/section-heading (T3), landing nav+hero (T4), trust strip + product showcase + L2 order (T5), how-it-works/impact/cta/footer (T6), app nav active indicator (T7), match card (T8), feed (T9), digest (T10), perfil + chips (T11), onboarding (T12), auth AU2 (T13), motion + a11y + verification guards (T1 + T14). All spec sections mapped.
- **Contrast:** ochre text only via `text-brand`/`text-brand-strong` per spec rules; hero/auth italic word is large display (`text-brand` ≥30px, 3.67:1 ✓); small ochre labels use `text-brand-strong` (5.57:1 ✓); CTA band uses secondary (cream/navy) not ochre fill.
- **Type consistency:** `MatchCardItem` import in product-showcase matches the exported interface in `match-card.tsx`; `StepState` type unchanged; `Kicker`/`SectionHeading`/`EmptyState` signatures match their usages.
- **No logic change:** onboarding step-state derivation, perfil submit payload, chips `addChip`, filters ALL sentinel, all hooks/eden calls untouched — only classNames/structure/new presentational components.
