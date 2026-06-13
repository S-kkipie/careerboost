# Spec 01 — Autenticación y conexión Gmail

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 00

## Objetivo

Login con Google vía Better Auth y obtención de un token de acceso a Gmail (solo lectura)
para el usuario autenticado. Al final: el usuario inicia sesión, pulsa "Conectar Gmail",
otorga el scope `gmail.readonly`, y el server puede recuperar un access token válido para
llamar a la Gmail API.

## Alcance

- Better Auth con provider Google (email/profile) montado dentro de Elysia.
- Tablas de Better Auth en Drizzle (`user`, `session`, `account`, `verification`).
- Flujo de scope adicional `gmail.readonly` con `linkSocial`.
- Helper server-side para obtener un access token fresco (auto-refresh).
- Endpoint que reporta si el usuario ya conectó Gmail.

## Diseño técnico

### Better Auth
```ts
// src/server/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";

export const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            accessType: "offline",         // emite refresh token
            prompt: "select_account consent",
        },
    },
});
```
- Generar el schema de Better Auth con su CLI y llevarlo a `schema.ts` (Drizzle).
- Montar el handler dentro de Elysia en `/api/auth/*` (verificar el path resuelto contra el
  `prefix:/api` — gotcha conocido).

### Conexión Gmail (scope adicional)
```ts
// cliente
await authClient.linkSocial({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
});
```
- Requiere Better Auth ≥ 1.2.7.
- Tras volver del OAuth, la cuenta tiene el scope y un access token utilizable.

### Token server-side
```ts
const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "google", userId },
    headers,
});
```
- Siempre obtener el token con `getAccessToken` (refresca si expiró). Nunca leer el token
  crudo de la fila `account`.
- No loguear tokens.

### Endpoints (Elysia)
- `GET /api/me` → usuario actual + `gmailConnected: boolean` (según scopes de la cuenta).
- La UI de onboarding (Spec 06) usa esto para mostrar/ocultar "Conectar Gmail".

## Contratos
```ts
GET /api/me → { user: { id, name, email, image }, gmailConnected: boolean }
```

## Criterios de aceptación
- Login Google funciona; se crea sesión y filas `user`/`account`.
- "Conectar Gmail" añade el scope `gmail.readonly` a la cuenta.
- `getAccessToken` devuelve un token que autoriza una llamada de prueba a
  `users.getProfile` de Gmail.
- `GET /api/me` refleja correctamente `gmailConnected`.
- Sin refresh token disponible se fuerza re-consentimiento (`prompt: consent`).

## Seguridad
- Scope **solo lectura**. Nunca pedir `gmail.modify`/`send`.
- Secrets solo en env. Tokens nunca en logs ni en respuestas al cliente.

## Fuera de alcance
Leer/parsear correos (Spec 04). UI final (Spec 06).

## Verificación
Login en navegador → conectar Gmail → endpoint de prueba que llama `users.getProfile` y
devuelve el email del buzón → `pnpm check`.
