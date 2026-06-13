# Spec 00 — Inicialización del proyecto

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** —

## Objetivo

Dejar el esqueleto funcional: Next.js 16 + Elysia montado como route handler único (API
versionada `/api/v1`), Drizzle conectado a Postgres con pgvector, env tipado, cliente Eden +
TanStack Query, Providers con Better Auth UI, Biome y scripts listos. Al final: `pnpm dev`
levanta la app y `GET /api/v1/health` responde `{ ok: true }` desde Elysia, consumible con
Eden tipado.

## Alcance

- Proyecto Next.js 16 (App Router, TypeScript strict) con pnpm.
- Biome (lint + format), 4 espacios, sin ESLint. Husky pre-commit → `pnpm fix`.
- Tailwind v4 + `globals.css` con tokens semánticos base; shadcn/ui base.
- Elysia (`prefix:/api`, grupo `/v1`) montado en `src/app/api/[[...slugs]]/route.ts`.
- Env tipado con `@t3-oss/env-nextjs` + zod + `ClientConfig`.
- Cliente Eden vía `eden-tanstack-react-query` (`apiClient` / `EdenProvider` / `useElysia`).
- `Providers` (Theme + Nuqs + QueryClient + Eden + Better Auth UI) + `authClient`.
- Drizzle + driver Postgres + extensión pgvector; `pnpm db:*` scripts.
- `.env.example` con todas las variables.

> Nota: el cableado **server** de Better Auth (provider Google, adapter Drizzle, handler en
> Elysia) es la Spec 01. Aquí solo se scaffolda el `authClient` y el `Providers` shell.

## Diseño técnico

### Estructura
```
src/
  app/
    api/[[...slugs]]/route.ts   # monta Elysia (export GET/POST = app.handle)
    layout.tsx                  # envuelve <Providers>
    page.tsx
    globals.css                 # tokens Tailwind v4
  config/
    env.ts                      # @t3-oss/env-nextjs + zod (server/client)
    client-config.ts            # ClientConfig (lee env)
  server/
    router.ts                   # instancia Elysia (prefix /api, grupo /v1); export type AppRouter
    db/
      index.ts                  # cliente Drizzle
      schema.ts                 # (vacío; Spec 02)
    services/                   # (lógica de dominio; specs siguientes)
    ai/                         # (Gemini; specs siguientes)
  frontend/
    providers/
      providers.tsx             # Theme > Nuqs > QueryClient > Eden > AuthUI
      theme-provider.tsx
    auth/
      auth.ts                   # authClient (better-auth/react)
    lib/
      eden.ts                   # apiClient, EdenProvider, useElysia
      query-client.ts           # getQueryClient
    components/
      ui/                       # shadcn primitives
drizzle.config.ts
biome.json
```

### Elysia router (API versionada)
```ts
// src/server/router.ts
import { Elysia } from "elysia";

export const app = new Elysia({ prefix: "/api" })
    .group("/v1", (v1) => v1.get("/health", () => ({ ok: true })));

export type AppRouter = typeof app;

// src/app/api/[[...slugs]]/route.ts
import { app } from "@/server/router";
export const GET = app.handle;
export const POST = app.handle;
```
- Rutas bajo `/api/v1/*`. Better Auth se monta aquí en Spec 01 (vigilar path vs prefix).

### Env tipado (`@t3-oss/env-nextjs`)
```ts
// src/config/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        DATABASE_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(32),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
        GEMINI_API_KEY: z.string().min(1),
        RESEND_API_KEY: z.string().optional(),
        CRON_SECRET: z.string().min(16),
    },
    client: {
        NEXT_PUBLIC_APP_URL: z.url(),
    },
    runtimeEnv: {
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        CRON_SECRET: process.env.CRON_SECRET,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
});
```
```ts
// src/config/client-config.ts
import { env } from "./env";
export const ClientConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
} as const;
```

### Cliente Eden (`eden-tanstack-react-query`)
```ts
// src/frontend/lib/eden.ts
import { treaty } from "@elysiajs/eden";
import { createEdenTanStackQuery } from "eden-tanstack-react-query";
import { ClientConfig } from "@/config/client-config";
import type { AppRouter } from "@/server/router";

const BASE_URL = ClientConfig.baseUrl;

const { EdenProvider, useEden } = createEdenTanStackQuery<AppRouter>();
const useElysia = () => useEden().api.v1;

const apiClient = treaty<AppRouter>(BASE_URL);

export { apiClient, EdenProvider, useElysia };
```

### authClient
```ts
// src/frontend/auth/auth.ts
import { createAuthClient } from "better-auth/react";
import { ClientConfig } from "@/config/client-config";
export const authClient = createAuthClient({ baseURL: ClientConfig.baseUrl });
```

### Providers (Better Auth UI)
`src/frontend/providers/providers.tsx` (`"use client"`), anidado:
```
<ThemeProvider attribute=class defaultTheme=system enableSystem>
  <ErrorBoundary>
    <NuqsAdapter>
      <QueryClientProvider client={getQueryClient()}>
        <EdenProvider client={apiClient} queryClient={...}>
          <TooltipProvider>
            <AuthUIProvider
                authClient={authClient}
                redirectTo="/onboarding"
                socialProviders={["google"]}
                emailAndPassword={{ enabled: false, forgotPassword: false }}
                navigate={({to,replace}) => replace ? router.replace(to) : router.push(to)}
                Link={Link}
                localization={spanishLocalization}>
              {children}
```
- `spanishLocalization`: textos `auth`/`settings` en español (como en el patrón del equipo).
- `getQueryClient` en `src/frontend/lib/query-client.ts`.
- `layout.tsx` envuelve `{children}` con `<Providers>`.

### Drizzle + pgvector
- `drizzle.config.ts` apunta a `src/server/db/schema.ts` y usa `env.DATABASE_URL`.
- Cliente en `src/server/db/index.ts` (`drizzle(postgres(env.DATABASE_URL))`).
- Primera migración habilita: `CREATE EXTENSION IF NOT EXISTS vector;`
- Host: Neon (free) o Postgres en Docker (`pgvector/pgvector`).

### Dependencias clave
`next` `react` · `elysia` `@elysiajs/eden` `eden-tanstack-react-query` `@tanstack/react-query` ·
`better-auth` `@better-auth-ui/react` · `nuqs` `next-themes` · `@t3-oss/env-nextjs` `zod` ·
`drizzle-orm` `postgres` `drizzle-kit` · `tailwindcss`(v4) · `@biomejs/biome` `husky`.

### Scripts (package.json)
`dev`, `build`, `start`, `check` (`biome check`), `fix` (`biome check --write`),
`db:generate`, `db:migrate`, `db:push`, `db:studio`.

## Variables de entorno (.env.example)
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY` (opcional), `CRON_SECRET`.

## Criterios de aceptación
- `pnpm dev` levanta sin errores; `GET /api/v1/health` → `{ ok: true }`.
- `apiClient.api.v1.health.get()` tipa correctamente (Eden + `AppRouter`).
- `env` falla el build si falta una variable requerida (validación t3).
- `<Providers>` renderiza (Theme + Query + Eden + AuthUI) sin errores en cliente.
- `pnpm check` y `pnpm build` pasan en limpio.
- `pnpm db:push` crea la extensión `vector` contra la DB configurada.

## Fuera de alcance
Cableado server de Better Auth + Gmail (Spec 01). Modelos de dominio (Spec 02). IA, UI real.

## Verificación
`pnpm check` → `pnpm build` → `pnpm dev` + curl `/api/v1/health` → `pnpm db:push`.
