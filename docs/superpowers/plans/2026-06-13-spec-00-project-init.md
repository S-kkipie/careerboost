# Spec 00 — Project Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CareerBoost skeleton — Next.js 16 + Elysia (`/api/v1`) in one server, typed env, Eden + TanStack Query client, Better Auth UI provider shell, Drizzle + Postgres + pgvector, Biome — so `pnpm dev` serves a typed `/api/v1/health`.

**Architecture:** Single Next.js 16 App Router app. One Elysia instance (`prefix:/api`, group `/v1`) mounted as a catch-all route handler at `src/app/api/[[...slugs]]/route.ts`. Frontend talks to it through Eden (`eden-tanstack-react-query`). Server code under `src/server/`, client under `src/frontend/`, config under `src/config/`.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Elysia, `@elysiajs/eden`, `eden-tanstack-react-query`, `@tanstack/react-query`, Better Auth + `@better-auth-ui/react`, `next-themes`, `nuqs`, `@t3-oss/env-nextjs` + zod, Drizzle + `postgres` + pgvector, Tailwind v4 + shadcn/ui, Biome, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-13-spec-00-project-init.md`

> **Note on package recency:** `eden-tanstack-react-query`, `@better-auth-ui/react`, and `@better-auth-ui/core` are recent (late-2025/2026). If `pnpm add` reports a name/version mismatch, run `pnpm view <pkg> version` and pin the latest published version rather than guessing.

---

### Task 1: Initialize Next.js 16 app (manual, into existing repo)

The repo already contains README/AGENTS/docs, so `create-next-app` (which requires an empty dir) cannot be used. Scaffold manually.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts` (auto), `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "careerboost",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Create `src/app/layout.tsx`** (Providers added in Task 7)

```tsx
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
```

- [ ] **Step 6: Create `src/app/page.tsx`**

```tsx
export default function Home() {
    return <main className="p-8 text-2xl font-semibold">CareerBoost</main>;
}
```

- [ ] **Step 7: Create `src/app/globals.css`** (placeholder; replaced by shadcn tokens in Task 3)

```css
@import "tailwindcss";
```

- [ ] **Step 8: Verify dev server boots**

Run: `pnpm dev` then in another shell `curl -s http://localhost:3000 | head -c 200`; stop the server.
Expected: HTML containing "CareerBoost". (Tailwind classes won't apply until Task 3 — that's fine.)

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts next-env.d.ts src/app
git commit -m "chore: scaffold Next.js 16 app"
```

---

### Task 2: Biome (lint + format, 4-space, no ESLint)

**Files:**
- Create: `biome.json`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install Biome**

Run: `pnpm add -D @biomejs/biome`
Expected: installs without error.

- [ ] **Step 2: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 4, "lineWidth": 80 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

> If `pnpm exec biome check` reports the schema version differs from the installed Biome, set `$schema` to the version printed by `pnpm exec biome --version`.

- [ ] **Step 3: Add scripts to `package.json`**

Add to `"scripts"`:
```json
"check": "biome check .",
"fix": "biome check --write ."
```

- [ ] **Step 4: Format the codebase**

Run: `pnpm fix`
Expected: existing files reformatted to 4-space; exits 0.

- [ ] **Step 5: Verify check passes**

Run: `pnpm check`
Expected: "Checked N files" with no errors.

- [ ] **Step 6: Commit**

```bash
git add biome.json package.json
git commit -m "chore: add Biome lint/format (4-space, no ESLint)"
```

---

### Task 3: Tailwind v4 + shadcn/ui base (tokens, cn, tooltip)

**Files:**
- Create: `postcss.config.mjs`, `components.json`, `src/frontend/lib/utils.ts`, `src/frontend/components/ui/tooltip.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Install Tailwind v4**

Run: `pnpm add tailwindcss @tailwindcss/postcss postcss`
Expected: installs without error.

- [ ] **Step 2: Create `postcss.config.mjs`**

```js
const config = {
    plugins: { "@tailwindcss/postcss": {} },
};
export default config;
```

- [ ] **Step 3: Replace `src/app/globals.css` with Tailwind v4 + shadcn tokens**

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
    --color-warning: var(--warning);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
}

:root {
    --radius: 0.625rem;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --primary: oklch(0.55 0.18 255);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.6 0.17 150);
    --warning: oklch(0.75 0.16 80);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
}

.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --primary: oklch(0.62 0.19 255);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.65 0.17 150);
    --warning: oklch(0.78 0.16 80);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
}

* { border-color: var(--border); }
body { background-color: var(--background); color: var(--foreground); }
```

- [ ] **Step 4: Create `src/frontend/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
```

Run: `pnpm add clsx tailwind-merge`
Expected: installs without error.

- [ ] **Step 5: Create `components.json` (shadcn, frontend aliases)**

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
    "cssVariables": true
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

- [ ] **Step 6: Add the tooltip component**

Run: `pnpm dlx shadcn@latest add tooltip`
Expected: creates `src/frontend/components/ui/tooltip.tsx` and installs `@radix-ui/react-tooltip`. If the CLI prompts, accept defaults.

> Fallback if the CLI fails offline: `pnpm add @radix-ui/react-tooltip` and create `src/frontend/components/ui/tooltip.tsx` exporting `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` as thin wrappers over `@radix-ui/react-tooltip` primitives (using `cn`).

- [ ] **Step 7: Verify Tailwind compiles**

Run: `pnpm build`
Expected: build succeeds; CSS emitted with the token variables.

- [ ] **Step 8: Commit**

```bash
git add postcss.config.mjs components.json src/app/globals.css src/frontend package.json pnpm-lock.yaml
git commit -m "chore: Tailwind v4 + shadcn base (tokens, cn, tooltip)"
```

---

### Task 4: Typed env + ClientConfig + .env.example

**Files:**
- Create: `src/config/env.ts`, `src/config/client-config.ts`, `.env.example`

- [ ] **Step 1: Install env tooling**

Run: `pnpm add @t3-oss/env-nextjs zod`
Expected: installs without error.

- [ ] **Step 2: Create `src/config/env.ts`**

```ts
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

- [ ] **Step 3: Create `src/config/client-config.ts`**

```ts
import { env } from "./env";

export const ClientConfig = {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
} as const;
```

- [ ] **Step 4: Create `.env.example`**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/careerboost"
BETTER_AUTH_SECRET="change-me-to-a-32+-char-random-string-xxxxxx"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GEMINI_API_KEY=""
RESEND_API_KEY=""
CRON_SECRET="change-me-min-16-chars"
```

- [ ] **Step 5: Create local env for development**

Run: `cp .env.example .env.local` then fill `DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `GEMINI_API_KEY`, `CRON_SECRET`. (Google creds can stay empty until Spec 01.)
Expected: `.env.local` exists (gitignored).

- [ ] **Step 6: Verify env validates on build**

Run: `pnpm build`
Expected: build succeeds. Then temporarily blank `BETTER_AUTH_SECRET` in `.env.local`, run `pnpm build` → expect a t3-env validation error naming `BETTER_AUTH_SECRET`. Restore the value.

- [ ] **Step 7: Commit**

```bash
git add src/config .env.example
git commit -m "feat: typed env (@t3-oss/env-nextjs) + ClientConfig"
```

---

### Task 5: Elysia router `/api/v1/health` + mount + health test (TDD)

**Files:**
- Create: `src/server/router.ts`, `src/server/router.test.ts`, `src/app/api/[[...slugs]]/route.ts`, `vitest.config.ts`

- [ ] **Step 1: Install Elysia, Eden, Vitest**

Run: `pnpm add elysia @elysiajs/eden` then `pnpm add -D vitest vite-tsconfig-paths`
Expected: installs without error.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: { environment: "node" },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing test** — `src/server/router.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { app } from "./router";

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

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./router` (module not created yet).

- [ ] **Step 5: Create `src/server/router.ts`**

```ts
import { Elysia } from "elysia";

export const app = new Elysia({ prefix: "/api" }).group("/v1", (v1) =>
    v1.get("/health", () => ({ ok: true })),
);

export type AppRouter = typeof app;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS (1 test).

- [ ] **Step 7: Mount Elysia in Next** — `src/app/api/[[...slugs]]/route.ts`

```ts
import { app } from "@/server/router";

export const GET = app.handle;
export const POST = app.handle;
```

- [ ] **Step 8: Verify the live endpoint**

Run: `pnpm dev`, then `curl -s http://localhost:3000/api/v1/health`; stop the server.
Expected: `{"ok":true}`.

- [ ] **Step 9: Commit**

```bash
git add src/server/router.ts src/server/router.test.ts src/app/api vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: Elysia router with /api/v1/health (mounted in Next)"
```

---

### Task 6: Eden client + query client

**Files:**
- Create: `src/frontend/lib/eden.ts`, `src/frontend/lib/query-client.ts`

- [ ] **Step 1: Install Eden TanStack + React Query**

Run: `pnpm add eden-tanstack-react-query @tanstack/react-query`
Expected: installs without error. (See recency note at top if it errors.)

- [ ] **Step 2: Create `src/frontend/lib/eden.ts`**

```ts
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

- [ ] **Step 3: Create `src/frontend/lib/query-client.ts`**

```ts
import { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000 } },
    });
}

export function getQueryClient() {
    if (typeof window === "undefined") return makeQueryClient();
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
}
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm check`
Expected: no type errors (Eden infers `useElysia().health` from `AppRouter`).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/lib/eden.ts src/frontend/lib/query-client.ts package.json pnpm-lock.yaml
git commit -m "feat: Eden + TanStack Query client (apiClient, useElysia)"
```

---

### Task 7: authClient + ThemeProvider + ErrorBoundary + Providers + layout wiring

**Files:**
- Create: `src/frontend/auth/auth.ts`, `src/frontend/providers/theme-provider.tsx`, `src/frontend/components/error-boundary.tsx`, `src/frontend/providers/providers.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install auth + UI provider deps**

Run: `pnpm add better-auth @better-auth-ui/react @better-auth-ui/core next-themes nuqs`
Expected: installs without error. (See recency note at top if a name/version errors.)

- [ ] **Step 2: Create `src/frontend/auth/auth.ts`**

```ts
import { createAuthClient } from "better-auth/react";
import { ClientConfig } from "@/config/client-config";

export const authClient = createAuthClient({ baseURL: ClientConfig.baseUrl });
```

- [ ] **Step 3: Create `src/frontend/providers/theme-provider.tsx`**

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props} />;
}
```

- [ ] **Step 4: Create `src/frontend/components/error-boundary.tsx`**

```tsx
"use client";

import { Component, type PropsWithChildren, type ReactNode } from "react";

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-destructive">
                    Algo salió mal. Recarga la página.
                </div>
            );
        }
        return this.props.children;
    }
}
```

- [ ] **Step 5: Create `src/frontend/providers/providers.tsx`**

```tsx
"use client";

import { AuthProvider as AuthUIProvider } from "@better-auth-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";
import { authClient } from "@/frontend/auth/auth";
import { ErrorBoundary } from "@/frontend/components/error-boundary";
import { TooltipProvider } from "@/frontend/components/ui/tooltip";
import { getQueryClient } from "@/frontend/lib/query-client";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { ThemeProvider } from "./theme-provider";

const spanishLocalization = {
    auth: {
        signIn: "Bienvenido de vuelta",
        signOut: "Cerrar sesión",
        signUp: "Registrarse",
        email: "Correo electrónico",
        emailPlaceholder: "correo@ejemplo.com",
        continueWith: "Continuar con {{provider}}",
        or: "o",
    },
    settings: {
        account: "Cuenta",
        security: "Seguridad",
        saveChanges: "Guardar cambios",
    },
};

export default function Providers({ children }: PropsWithChildren) {
    const queryClient = getQueryClient();
    const router = useRouter();

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <ErrorBoundary>
                <NuqsAdapter>
                    <QueryClientProvider client={queryClient}>
                        <EdenProvider
                            client={apiClient}
                            queryClient={queryClient}
                        >
                            <TooltipProvider>
                                <AuthUIProvider
                                    authClient={authClient}
                                    redirectTo="/onboarding"
                                    socialProviders={["google"]}
                                    emailAndPassword={{
                                        enabled: false,
                                        forgotPassword: false,
                                    }}
                                    navigate={({ to, replace }) =>
                                        replace
                                            ? router.replace(to)
                                            : router.push(to)
                                    }
                                    Link={Link}
                                    localization={spanishLocalization}
                                >
                                    {children}
                                </AuthUIProvider>
                            </TooltipProvider>
                        </EdenProvider>
                    </QueryClientProvider>
                </NuqsAdapter>
            </ErrorBoundary>
        </ThemeProvider>
    );
}
```

> If TypeScript flags an unknown prop on `AuthUIProvider` (the package API may differ slightly by version), run `pnpm view @better-auth-ui/react version`, check the published prop names, and adjust — do NOT use `as any`.

- [ ] **Step 6: Wire `Providers` into `src/app/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import Providers from "@/frontend/providers/providers";
import "./globals.css";

export const metadata = { title: "CareerBoost" };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
```

- [ ] **Step 7: Verify the app renders with providers**

Run: `pnpm dev`, open `http://localhost:3000`, confirm "CareerBoost" renders with no console errors; stop the server.
Expected: page renders; no provider crash. (Auth calls won't work until Spec 01 — that's expected.)

- [ ] **Step 8: Verify types + lint**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/frontend/auth src/frontend/providers src/frontend/components/error-boundary.tsx src/app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat: app Providers (Theme, Query, Eden, Better Auth UI)"
```

---

### Task 8: Drizzle + Postgres + pgvector

**Files:**
- Create: `src/server/db/index.ts`, `src/server/db/schema.ts`, `drizzle.config.ts`, `scripts/db-init.ts`
- Modify: `package.json` (db scripts)

- [ ] **Step 1: Install Drizzle + driver + tsx**

Run: `pnpm add drizzle-orm postgres` then `pnpm add -D drizzle-kit tsx`
Expected: installs without error.

- [ ] **Step 2: Create `src/server/db/schema.ts`** (placeholder; real tables in Spec 02)

```ts
// Domain tables are defined in Spec 02. Kept empty so drizzle-kit has a valid schema entry.
export {};
```

- [ ] **Step 3: Create `src/server/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/server/db/schema.ts",
    out: "./drizzle",
    dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 5: Create `scripts/db-init.ts`** (enables pgvector — drizzle-kit won't)

```ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const sql = postgres(url);
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
const [row] = await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
console.log(row ? "pgvector enabled" : "pgvector NOT enabled");
await sql.end();
```

- [ ] **Step 6: Add db scripts to `package.json`**

```json
"db:init": "tsx scripts/db-init.ts",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 7: Start a local Postgres with pgvector (if no Neon URL)**

Run:
```bash
docker run -d --name careerboost-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=careerboost -p 5432:5432 pgvector/pgvector:pg16
```
Expected: container running; `DATABASE_URL` in `.env.local` points to it. (Skip if using a Neon URL.)

- [ ] **Step 8: Enable pgvector**

Run: `pnpm db:init`
Expected: prints `pgvector enabled`.

- [ ] **Step 9: Verify drizzle connects**

Run: `pnpm db:push`
Expected: drizzle-kit connects and reports no schema changes (schema is empty) — no connection errors.

- [ ] **Step 10: Commit**

```bash
git add src/server/db drizzle.config.ts scripts/db-init.ts package.json pnpm-lock.yaml
git commit -m "feat: Drizzle + Postgres client + pgvector init"
```

---

### Task 9: Husky pre-commit + full verification

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (`prepare` script)

- [ ] **Step 1: Install Husky**

Run: `pnpm add -D husky` then `pnpm exec husky init`
Expected: creates `.husky/` and a `prepare` script.

- [ ] **Step 2: Set the pre-commit hook** — `.husky/pre-commit`

```sh
pnpm fix
```

- [ ] **Step 3: Confirm `prepare` script exists in `package.json`**

Expected: `"prepare": "husky"` present (added by `husky init`). If missing, add it.

- [ ] **Step 4: Full verification sweep**

Run, expecting all to pass:
```bash
pnpm check
pnpm test
pnpm build
```
Then `pnpm dev` + `curl -s http://localhost:3000/api/v1/health` → `{"ok":true}`; stop the server.

- [ ] **Step 5: Verify the hook fires**

Run: `git add -A && git commit -m "chore: add Husky pre-commit (pnpm fix)"`
Expected: `pnpm fix` runs during the commit and the commit succeeds.

---

## Self-Review

**Spec coverage** (spec-00 → task):
- Next.js 16 App Router + pnpm + TS strict → Task 1 ✅
- Biome (no ESLint, 4-space) + Husky pre-commit → Task 2, Task 9 ✅
- Tailwind v4 + globals.css tokens + shadcn base → Task 3 ✅
- Elysia `prefix:/api` group `/v1`, mounted catch-all, `AppRouter` type → Task 5 ✅
- Eden via `eden-tanstack-react-query` (`apiClient`/`EdenProvider`/`useElysia`) → Task 6 ✅
- Env `@t3-oss/env-nextjs` + `ClientConfig` + `.env.example` → Task 4 ✅
- Providers (Theme + Nuqs + Query + Eden + Better Auth UI) + `authClient` → Task 7 ✅
- Drizzle + Postgres + pgvector + `db:*` scripts → Task 8 ✅
- Acceptance `GET /api/v1/health` → `{ok:true}`, typed Eden, env validation, Providers render, `check`/`build` clean, `db:push` + pgvector → Tasks 5/6/4/7/9/8 ✅

**Placeholder scan:** schema.ts is intentionally empty (real tables = Spec 02, stated in spec scope) — not a plan placeholder. No TBD/TODO steps; every code step shows full code.

**Type consistency:** `app`/`AppRouter` from `src/server/router.ts` used consistently in `route.ts`, test, and `eden.ts`. `getQueryClient` defined in Task 6, consumed in Task 7. `ClientConfig.baseUrl` defined in Task 4, used in Tasks 6 & 7. `cn` (Task 3) available for the tooltip fallback. Import paths use the `@/*` alias defined in Task 1's tsconfig.

**Out of scope (deferred, correct):** Better Auth server config + Google provider + Gmail scope (Spec 01); domain tables (Spec 02).
