# CareerBoost — Visión general del diseño

> Producto: **CareerBoost**. Reto del hackathon: **CONECTA UNSA** (UNSA), usado solo como referencia.

**Fecha:** 2026-06-13
**Estado:** Aprobado para implementación
**Equipo:** 2 personas (Diego + Claude), construcción secuencial

## Reto

Transformar la bolsa de trabajo de la UNSA, hoy un canal de difusión masiva sin
segmentación (+100 correos/mes/usuario, 27% ruido, 90% sin salario), en un sistema que
entregue al egresado **solo los empleos relevantes, confiables y con claridad salarial**,
haciéndolo sentir reconocido como profesional específico.

## Pregunta central

> ¿Cómo ayudamos a los egresados de la UNSA que buscan empleo en plataformas externas a
> encontrar oportunidades relevantes y confiables desde el canal institucional, con
> formatos estandarizados, claridad salarial y cero ruido?

## Decisión de producto

En vez de reconstruir el backend institucional de correos, el MVP opera **del lado del
egresado**: lee su propio Gmail (solo lectura), encuentra los correos de la bolsa que ya lo
saturan, y les aplica la inteligencia que la institución no tiene. Cero dependencia
institucional, valor demostrable hoy sobre correos reales.

## Arquitectura (resumen)

| Capa | Tecnología |
|---|---|
| Server único | Next.js 16 (App Router) |
| API | Elysia en `app/api/[[...slugs]]/route.ts` (`prefix:/api`) |
| Auth | Better Auth (Google) + Gmail `readonly` vía `linkSocial` |
| Cliente → API | Eden Treaty |
| Frontend | React + Tailwind v4 |
| ORM / DB | Drizzle + Postgres + pgvector |
| IA | Gemini `gemini-2.5-flash` + `gemini-embedding-2` @768 |
| Cron | Vercel Cron → `/api/cron/digest` |
| Lint | Biome |

## Flujo end-to-end

```
1. Login (Google) → conectar Gmail (readonly) → subir CV
2. CV → Gemini extrae perfil → embedding del perfil
3. Ingesta Gmail:
     correo → clasificar ¿empleo? (27% ruido fuera)
            → extraer {título, empresa, modalidad, lugar,
                       salario{min,max,moneda,periodo,explícito}, requisitos, skills, link}
            → normalizar salario → dedupe → embedding del empleo
            → registrar métricas en ingestion_runs
4. Match: pgvector cosine(perfil↔empleos) + filtros (carrera/lugar/vigencia)
          + boost a salario_explícito → rerank Gemini (score + "por qué") → matches
5. Feed: panel de impacto + match cards (badge salario, %, explicación) + filtros
6. Digest: cron → top matches nuevos (in-app + opcional 1 correo)
```

## Motor de match (decisión: B + filtros de C)

1. **Retrieval** semántico con pgvector (cosine) sobre los empleos del usuario.
2. **Filtros duros**: carrera/área compatible, misma ciudad o remoto, deadline vigente.
3. **Boost**: vacantes con salario explícito suben (premia transparencia).
4. **Rerank** con Gemini: score 0-100 + explicación en español + flags.

## Plan de specs (secuencial)

| # | Spec | Entrega |
|---|---|---|
| 00 | Project init | Next.js + Elysia + Drizzle + Biome + pgvector funcionando |
| 01 | Auth & Gmail | Login Google + token Gmail readonly |
| 02 | Data model | Schema Drizzle + pgvector + migraciones |
| 03 | Profile/CV | Subir CV → perfil extraído + embedding |
| 04 | Email ingestion | Pipeline Gmail → empleos estructurados + métricas |
| 05 | Matching engine | Matches rankeados con explicación |
| 06 | Feed & UI | Onboarding + feed + cards + panel impacto |
| 07 | Digest & demo | Cron digest + datos de demo + guion |

Cada spec declara: objetivo, dependencias, alcance, diseño técnico, contratos/datos,
criterios de aceptación, fuera de alcance y verificación. Se implementan en orden; cada una
es desplegable/demostrable por sí sola.

## Métricas de éxito del demo

- **Cero ruido**: el panel muestra correos escaneados vs. ruido filtrado vs. empleos reales.
- **Claridad salarial**: badge 🟢/⚪ y filtro "solo con salario".
- **Match exacto**: % de match + explicación por vacante.
- **Anti-saturación**: "100+ correos/mes → 1 digest".

## Fuera de alcance (MVP)

Dedupe global cross-usuario · scraping externo · LinkedIn · WhatsApp/push · panel admin
institucional · fine-tuning · auto-postulación · bachilleres/titulados.
