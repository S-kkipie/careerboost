# CareerBoost

**Oportunidades laborales inteligentes para egresados.**

> Propuesta para el reto **CONECTA UNSA** del hackathon (Universidad Nacional de San Agustín).
> *CareerBoost* es el nombre del producto; *CONECTA UNSA* se usa solo como referencia al desafío.

Bolsa de trabajo inteligente que vive del lado del egresado: conecta su Gmail (solo
lectura), limpia el ruido de los correos masivos de la bolsa institucional, extrae cada
vacante en formato estandarizado, exige claridad salarial y devuelve solo los empleos que
hacen *match* con su perfil profesional.

---

## El problema

La Bolsa de Trabajo de la UNSA atiende a **9,179 usuarios** (3,498 egresados, 3,240
bachilleres, 2,441 titulados) como un canal de **difusión masiva sin segmentación**:

- Cada usuario recibe **+100 correos/mes**.
- En el semestre 2025-2 se enviaron **736 correos**, con **27% de ruido** (95 correos que
  no eran empleos) y solo **285 oportunidades reales**.
- **90% de las vacantes no precisan remuneración** (opacidad salarial).

Resultado: saturación, desconfianza y fuga de egresados hacia bolsas externas.

## La solución

No esperamos a que la institución arregle su sistema de correos masivos. Lo arreglamos
**desde el lado del egresado**:

```
Gmail (solo lectura) → encontrar correos de la bolsa
  → clasificar: ¿es empleo?  (mata el 27% de ruido)
  → extraer {título, empresa, modalidad, lugar, salario, requisitos, skills, link}
  → normalizar salario  (marca el 90% sin sueldo)
  → deduplicar → generar embedding
  → match contra el perfil (CV) → reordenar con explicación
  → feed limpio + 1 digest periódico
```

El egresado se siente **reconocido como profesional específico**: cada vacante llega con
un *"por qué te lo recomendamos"*, un porcentaje de match, y un badge de salario claro
(🟢 visible / ⚪ no informado).

## Stack

| Capa | Tecnología |
|---|---|
| Server único | **Next.js 16** (App Router) |
| API | **Elysia** montado en `app/api/[[...slugs]]/route.ts` |
| Auth | **Better Auth** (Google) + Gmail `readonly` vía `linkSocial` |
| Cliente → API | **Eden Treaty** (typed) |
| Frontend | React + **Tailwind v4** (+ shadcn/ui opcional) |
| ORM / DB | **Drizzle** + **Postgres** + **pgvector** |
| IA | **Gemini** `gemini-2.5-flash` (extraer/clasificar/rerank) + `gemini-embedding-2` @768 dims |
| Cron | **Vercel Cron** → `/api/cron/digest` |
| Lint/format | **Biome** (no ESLint) |

## Arquitectura en un solo server

Elysia se monta dentro de Next.js como route handler catch-all. Un solo proceso, un solo
deploy:

```ts
// app/api/[[...slugs]]/route.ts
import { app } from "@/server/app"; // instancia Elysia con prefix "/api"
export const GET = app.handle;
export const POST = app.handle;
```

Better Auth se monta dentro de Elysia (`/api/auth/*`). El frontend Next consume la API con
Eden Treaty type-safe.

## Puesta en marcha (local)

Requisitos: **Node 20+** (o Bun), **pnpm**, **Postgres con pgvector** (Docker o Neon),
una **API key de Gemini** y credenciales **OAuth de Google**.

```bash
pnpm install
cp .env.example .env.local          # completar variables
pnpm db:push                        # crear schema + extensión pgvector
pnpm dev                            # http://localhost:3000
```

### Variables de entorno

```bash
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GEMINI_API_KEY=...
RESEND_API_KEY=...                  # opcional (digest por correo)
CRON_SECRET=...                     # protege /api/cron/digest
```

## Google OAuth + Gmail

### Crear credenciales en Google Cloud

1. Crear (o seleccionar) un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Ir a **APIs & Services → Library**, buscar **Gmail API** y hacer clic en **Enable**.
3. Ir a **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
   - Tipo de aplicación: **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:3000`
     (añadir la URL de producción al desplegar).
   - **Authorized redirect URIs:** `http://localhost:3000/api/v1/auth/callback/google`
     (añadir el equivalente de producción al desplegar).
4. Copiar el **Client ID** y el **Client Secret** al archivo `.env.local`:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
5. En **OAuth consent screen**:
   - Añadir el scope `https://www.googleapis.com/auth/gmail.readonly`.
   - Mientras la app esté en modo **Testing**, agregar la cuenta Google del egresado
     como **Test user** (sin esto, Google bloquea el flujo de consentimiento).

> **Nota de producción:** el proveedor está configurado con `accessType: "offline"` y
> `prompt: "select_account consent"` para obtener un *refresh token* de Gmail.

### Verificación manual de auth

Estos pasos requieren credenciales reales de Google y un navegador; no pueden
automatizarse en CI.

1. Asegurarse de tener `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` válidos en
   `.env.local`, luego ejecutar:
   ```bash
   pnpm dev
   ```
2. Iniciar sesión con Google usando el cliente de Better Auth (la UI de login llega en
   la Spec 06; hasta entonces, llamar desde un botón temporal o la consola del navegador):
   ```ts
   import { authClient } from "@/frontend/auth/client";
   await authClient.signIn.social({ provider: "google" });
   ```
3. Conectar Gmail (segunda pantalla de consentimiento para el scope `gmail.readonly`)
   llamando al helper del cliente:
   ```ts
   import { requestGmailAccess } from "@/frontend/auth/gmail";
   await requestGmailAccess();
   ```
4. Verificar que el usuario tiene Gmail conectado:
   ```bash
   GET /api/v1/me
   # Respuesta esperada: { "user": { ... }, "gmailConnected": true }
   ```
5. Verificar que el token funciona de extremo a extremo:
   ```bash
   GET /api/v1/gmail/profile
   # Respuesta esperada: { "email": "usuario@gmail.com" }
   ```
   - Sin conectar Gmail → `400 { "code": "gmail_not_connected" }`
   - Sin sesión activa → `401 { "code": "unauthenticated" }`

## Scripts

| Script | Acción |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm check` | Biome (lint + types) |
| `pnpm fix` | Biome con fixes seguros |
| `pnpm db:generate` | Genera migraciones Drizzle |
| `pnpm db:migrate` | Aplica migraciones |
| `pnpm db:push` | Sincroniza schema (dev) |
| `pnpm db:studio` | Drizzle Studio |

## Plan de construcción (specs)

El proyecto se construye en fases secuenciales. Cada spec vive en
[`docs/superpowers/specs/`](docs/superpowers/specs/):

0. **Project init** — Next.js + Elysia + Drizzle + Biome + pgvector.
1. **Auth & Gmail** — Better Auth Google + scope `gmail.readonly` + token.
2. **Data model** — schema Drizzle + pgvector + migraciones.
3. **Profile/CV** — subir CV PDF → Gemini extrae perfil → embedding.
4. **Email ingestion** — Gmail → clasificar → extraer → salario → dedupe → embed.
5. **Matching engine** — retrieval pgvector + filtros + boost + rerank Gemini.
6. **Feed & UI** — onboarding, feed, match cards, panel impacto, filtros.
7. **Digest & demo** — cron digest + datos de demo + guion.

Visión general: [`2026-06-13-careerboost-overview.md`](docs/superpowers/specs/2026-06-13-careerboost-overview.md).

## Alcance del MVP (hackathon)

**Dentro:** egresados; ingesta del propio Gmail; clasificación + extracción + claridad
salarial; match semántico con explicación; feed + digest.

**Fuera (YAGNI):** dedupe global cross-usuario, scraping de bolsas externas, LinkedIn,
WhatsApp/push multicanal, panel admin institucional, fine-tuning, auto-postulación,
bachilleres/titulados.
