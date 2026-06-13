# Coding Guide

## Project Shape

- This is a single **Next.js 16** app (App Router) with an **Elysia** API mounted inside it.
  It is **not** a Turborepo workspace — keep it one app, one deploy.
- The Elysia instance is mounted as a catch-all route handler at
  `src/app/api/[[...slugs]]/route.ts` (`export const GET = app.handle` / `POST`).
- The API is versioned: Elysia uses `prefix: "/api"` with routes grouped under `/v1`
  (so endpoints live at `/api/v1/*`). The router type `AppRouter` is exported from
  `src/server/router.ts`.
- Server/API code lives under `src/server/` (Elysia router, services, AI, Gmail, db).
- Frontend code lives under `src/app/` (pages/layouts) and `src/frontend/`
  (providers, auth, lib, components/ui).
- Config (env, client-config) lives under `src/config/`. The Eden client + query client
  live under `src/frontend/lib/`.
- Keep code, config, assets, and env examples at the repo root unless clearly module-level.

## Commands

- Install dependencies from the repo root: `pnpm install`.
- Run dev server: `pnpm dev` (http://localhost:3000).
- Build: `pnpm build`.
- Check (Biome lint + types): `pnpm check`.
- Format and apply safe Biome fixes: `pnpm fix`.
- Database (Drizzle): `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`, `pnpm db:studio`.
- Husky pre-commit runs `pnpm fix`; do not replace it with lint-only checks.

## Code Style

- Use **Biome**, not ESLint. Do not add ESLint config or scripts.
- Preserve 4-space indentation and existing naming/import style.
- Prefer small, focused changes. Do not refactor unrelated code while fixing or adding a feature.
- Keep files under 500 lines. Split large files into smaller modules, components, hooks, or helpers whenever practical.
- Do not use `any`, `as any`, `as unknown as`, `@ts-ignore`, or `@ts-expect-error` to silence type errors.
- Prefer explicit types, clear names, pure helpers, early returns, and narrow module boundaries.
- Keep business logic out of UI components when it can live in typed utilities, hooks, or server modules.
- All Gemini/Gmail/db access goes through `src/server/` services — never call external APIs directly from React components.

## Rule: TSDoc is opt-in, not mandatory

Do NOT generate TSDoc for every exported symbol.

Only document APIs when the documentation adds information that cannot be immediately inferred from:

- the function name;
- parameter names;
- types;
- file name;
- surrounding code.

Good candidates include:

- reusable libraries
- shared utilities
- hooks with non-obvious behavior
- business rules (salary normalization, dedupe hashing, match scoring/boost)
- caching semantics (e.g. skip-already-processed `gmail_msg_id`)
- concurrency guarantees
- side effects
- invariants
- performance characteristics
- security-sensitive code (OAuth token handling, Gmail scope)
- public SDK APIs

Do NOT document:

- React components
- Next.js pages
- layout components
- presentational components
- simple wrappers
- obvious getters/setters
- obvious CRUD helpers

If the summary would simply restate the function name, omit the TSDoc entirely.

Prefer expressive code over explanatory comments.

## Backend (Elysia)

- The single Elysia app (`src/server/router.ts`) uses `prefix: "/api"`, groups routes under
  `/v1`, and is mounted once in `src/app/api/[[...slugs]]/route.ts`. Do not create parallel
  Next.js route handlers for API logic.
- Frontend calls the API through Eden (`eden-tanstack-react-query`): `useElysia()` (= `api.v1`)
  for React Query hooks, `apiClient` for imperative calls. Do not hand-roll `fetch` to `/api`.
- Group routes by domain with Elysia plugins: `auth`, `profile`, `ingestion`, `matches`, `cron`.
- Validate every input with Elysia's `t` schemas; do not trust request bodies.
- Better Auth's handler is mounted inside Elysia (`/api/auth/*`). Watch the mount path vs the
  `/api` prefix — verify the resolved URL, don't assume.
- Keep route handlers thin: parse/validate → call a service in `src/server/services/` → return.

## Database (Drizzle + Postgres + pgvector)

- Drizzle is the single source of truth for the schema (`src/server/db/schema.ts`).
- Vectors use the `pgvector` `vector(768)` column type. Keep embedding dimension at **768**
  everywhere (Gemini `gemini-embedding-2` truncated via `outputDimensionality`).
- Enable the `vector` extension in a migration before any vector column.
- Use parameterized Drizzle queries; raw SQL only for vector distance operators (`<=>`),
  and even then keep it in a typed helper.
- Enforce per-user isolation in every query (`where user_id = current user`). There is no RLS;
  the app is responsible for scoping.

## Auth & Gmail (Better Auth)

- Google sign-in grants `email`/`profile`. Gmail access is requested **separately** via
  `authClient.linkSocial({ provider: "google", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] })`.
- Set `accessType: "offline"` and `prompt: "consent"` on the Google provider so a refresh token is issued.
- Get a fresh token server-side with `auth.api.getAccessToken(...)`; never read tokens directly from the DB row.
- Gmail is **read-only**. Never request write/modify scopes. Never log token values or raw email bodies.

## AI (Gemini)

- Use the `@google/genai` SDK with `GEMINI_API_KEY`.
- Models: `gemini-2.5-flash` for classification/extraction/rerank; `gemini-embedding-2` (768 dims) for embeddings.
- All extraction/classification/rerank calls MUST use structured output (`responseSchema` / JSON mode).
  Do not parse free-form model text.
- Keep prompts and schemas in `src/server/ai/` so they are versioned and testable.
- Salary normalization is LLM-first with a deterministic regex fallback; treat `"según mercado"`,
  `"a tratar"`, etc. as `explicito: false`.

## Styling (Tailwind v4)

- `src/app/globals.css` is the single source of truth for design tokens once created. Read it before styling.
- Map colors to semantic tokens (`primary`, `destructive`, `success`, `warning`, `muted`,
  `secondary`, `border`, `card`). Do not hardcode palette colors (`text-rose-600`, `bg-zinc-900`, `text-white`).
- Use the `/10` opacity form for soft tinted surfaces (`bg-success/10`).
- No manual `dark:` color overrides — theme inverts through token roles.
- Prefer Tailwind scale utilities over arbitrary px; Tailwind v4 spacing is dynamic, so integer
  steps work (`gap-2`, `h-15`). Use arbitrary px only when no scale step fits.
- Salary badge: 🟢 visible → `success` token; ⚪ no informado → `muted` token.

## Next.js

- This repo uses **Next.js 16**. Do not assume older Next.js APIs or file conventions.
- Before changing Next.js behavior, read the relevant guide in `node_modules/next/dist/docs/`
  and follow current deprecation notes.

## Verification

- After code changes, run diagnostics/checks for touched files when available, then run `pnpm check`.
- Run `pnpm build` for changes that affect app runtime, routing, config, server code, or build output.
- For DB schema changes, run `pnpm db:push` (dev) and confirm migrations are committed.
- For UI changes, verify the app in a browser at `http://localhost:3000`.
- Never claim a step passed without running it; paste the real output.
