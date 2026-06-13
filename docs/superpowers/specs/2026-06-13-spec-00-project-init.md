# Spec 00 — Inicialización del proyecto

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** —

## Objetivo

Dejar el esqueleto funcional: Next.js 16 + Elysia montado como route handler único, Drizzle
conectado a Postgres con pgvector, Biome y scripts listos. Al final: `pnpm dev` levanta la
app y `GET /api/health` responde `{ ok: true }` desde Elysia.

## Alcance

- Proyecto Next.js 16 (App Router, TypeScript strict) con pnpm.
- Biome (lint + format), 4 espacios, sin ESLint. Husky pre-commit → `pnpm fix`.
- Tailwind v4 + `globals.css` con tokens semánticos base.
- Elysia montado en `src/app/api/[[...slugs]]/route.ts`.
- Eden Treaty client en `src/lib/api.ts`.
- Drizzle + driver Postgres + extensión pgvector; `pnpm db:*` scripts.
- `.env.example` con todas las variables.

## Diseño técnico

### Estructura
```
src/
  app/
    api/[[...slugs]]/route.ts   # monta Elysia
    layout.tsx  page.tsx
    globals.css                 # tokens Tailwind v4
  server/
    app.ts                      # instancia Elysia (prefix /api) + plugins
    db/
      index.ts                  # cliente Drizzle
      schema.ts                 # (vacío por ahora; Spec 02)
    services/                   # (lógica de dominio; specs siguientes)
    ai/                         # (Gemini; specs siguientes)
  components/
  lib/
    api.ts                      # Eden Treaty client
drizzle.config.ts
biome.json
```

### Elysia mount
```ts
// src/server/app.ts
import { Elysia, t } from "elysia";
export const app = new Elysia({ prefix: "/api" })
    .get("/health", () => ({ ok: true }));
export type App = typeof app;

// src/app/api/[[...slugs]]/route.ts
import { app } from "@/server/app";
export const GET = app.handle;
export const POST = app.handle;
```

### Eden Treaty
```ts
// src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "@/server/app";
export const api = treaty<App>(
    typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
);
```

### Drizzle + pgvector
- `drizzle.config.ts` apunta a `src/server/db/schema.ts` y usa `DATABASE_URL`.
- Cliente en `src/server/db/index.ts` (`drizzle(postgres(DATABASE_URL))`).
- Primera migración habilita la extensión: `CREATE EXTENSION IF NOT EXISTS vector;`
- Host recomendado: Neon (free) o Postgres en Docker (`pgvector/pgvector` image).

### Scripts (package.json)
`dev`, `build`, `start`, `check` (`biome check`), `fix` (`biome check --write`),
`db:generate`, `db:migrate`, `db:push`, `db:studio`.

## Variables de entorno (.env.example)
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY` (opcional), `CRON_SECRET`.

## Criterios de aceptación
- `pnpm dev` levanta sin errores; `GET /api/health` → `{ ok: true }`.
- `pnpm check` y `pnpm build` pasan en limpio.
- `pnpm db:push` crea la extensión `vector` contra la DB configurada.
- Eden Treaty tipa `api.health.get()` sin errores de TS.

## Fuera de alcance
Auth, modelos de datos de dominio, UI real, IA. (Specs 01+.)

## Verificación
`pnpm check` → `pnpm build` → `pnpm dev` + curl `/api/health` → `pnpm db:push`.
