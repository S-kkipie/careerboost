# DESIGN.md — CareerBoost / CONECTA UNSA

Design system extracted from the live token system (`src/app/globals.css`, Tailwind v4
`@theme` + oklch `:root`/`.dark`). This is the single source of truth Stitch prompts must
embed for visual consistency. Hex values are sRGB approximations of the canonical oklch
tokens (the React port uses the oklch tokens verbatim — do not hardcode hex in code).

## 1. Brand & tone
- Product: **CareerBoost** (a.k.a. **CONECTA UNSA**) — an intelligent job-opportunity inbox
  for UNSA graduates. It reads the university job-board emails (read-only), de-noises them,
  and surfaces personalized, salary-transparent matches.
- Voice: **institutional, trustworthy, clear, modern**. Spanish (Peru). Public-sector /
  university credibility. No hype, no dark patterns. Emphasize: privacy, read-only Gmail,
  transparency (salary always shown or explicitly marked "No especificado").

## 2. Color palette (oklch canonical → hex approx)

### Light
- background `oklch(1 0 0)` ≈ `#FFFFFF`
- foreground `oklch(0.145 0 0)` ≈ `#252525`
- card `#FFFFFF`, card-foreground `#252525`
- **primary (blue, institutional) `oklch(0.55 0.18 255)` ≈ `#2563EB`**, primary-foreground `#FAFAFA`
- secondary / muted / accent `oklch(0.97 0 0)` ≈ `#F7F7F7`, foreground `#343434`
- muted-foreground `oklch(0.556 0 0)` ≈ `#8E8E8E`
- **success (green, salary explícito) `oklch(0.6 0.17 150)` ≈ `#16A34A`**, foreground `#FAFAFA`
- **warning (amber) `oklch(0.75 0.16 80)` ≈ `#D97706`**, foreground `#343434`
- destructive (red) `oklch(0.577 0.245 27)` ≈ `#DC2626`
- border / input `oklch(0.922 0 0)` ≈ `#EBEBEB`, ring `#B5B5B5`

### Dark
- background `oklch(0.145 0 0)` ≈ `#252525`
- foreground `#FAFAFA`
- card `oklch(0.205 0 0)` ≈ `#343434`
- primary `oklch(0.62 0.19 255)` ≈ `#3B82F6`
- success `#22C55E`, warning `#F59E0B`
- border `white/10%`, input `white/15%`

## 3. Typography
- Family: **Inter** (system fallback). UI sans only.
- Headings: bold, tight tracking. Body: normal. Small/meta: muted-foreground.

## 4. Shape & spacing
- Radius base `--radius: 0.625rem` (10px). sm = 6px, md = 8px, lg = 10px.
- Cards: rounded-lg, 1px border (`--border`), subtle/no shadow (flat institutional).
- Generous whitespace; max content width ~1100px; comfortable section padding.

## 5. Components language
- Buttons: primary = solid blue; secondary = neutral grey; ghost = transparent.
- Badges: success = green (salary explícito), muted = grey (no especificado), warning = amber.
- Inputs: 40px height, 1px border, rounded-md, neutral background.
- Light + dark must both be first-class (theme toggle present).

## 6. DESIGN SYSTEM BLOCK (paste into every Stitch prompt)

> **Design system (REQUIRED):**
> Brand: CareerBoost / CONECTA UNSA — institutional, trustworthy, modern job-inbox for UNSA
> graduates. Spanish (Peru) copy. Clean, flat, university-credible. No hype.
> Font: Inter.
> Colors — primary institutional blue #2563EB (primary text #FAFAFA); neutral surfaces
> #FFFFFF / cards #FFFFFF on light; success green #16A34A (used for explicit-salary badges);
> warning amber #D97706; destructive red #DC2626; muted grey #F7F7F7 with #8E8E8E text;
> borders #EBEBEB. Support a dark theme (bg #252525, cards #343434, primary #3B82F6).
> Shape: rounded corners radius 10px; cards have a 1px subtle border and minimal shadow.
> Layout: max width ~1100px, generous whitespace, comfortable padding.
> Components: solid blue primary buttons, neutral secondary buttons, ghost buttons;
> pill badges (green for "salario explícito", grey for "no especificado"); 40px inputs.
> Tone of imagery/icons: simple line icons (lucide style), professional, minimal.
