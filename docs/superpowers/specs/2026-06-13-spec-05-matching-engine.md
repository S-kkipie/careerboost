# Spec 05 — Motor de match

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 02, 03, 04

## Objetivo

Producir, para cada egresado, una lista de empleos rankeados con porcentaje de match y una
explicación en español. Estrategia: **B (embed → rerank) + filtros de C**. Al final:
`matches` se puebla y es consultable para el feed.

## Alcance

- Retrieval semántico con pgvector (cosine) sobre los empleos del usuario.
- Filtros duros (carrera/área, ubicación, vigencia).
- Boost por salario explícito.
- Rerank con Gemini → score 0-100 + explicación + flags.
- Persistencia de matches + endpoint para el feed.

## Diseño técnico

### 1. Retrieval (pgvector)
```sql
SELECT j.*, (j.embedding <=> $profileEmbedding) AS distance
FROM jobs j
WHERE j.user_id = $userId
  AND j.is_job = true
  AND (j.deadline IS NULL OR j.deadline >= current_date)
  AND ( /* carrera/área compatible: heurística + skills overlap */ )
  AND ( j.modalidad = 'remoto' OR j.ubicacion ~ $ciudadUsuario )
ORDER BY distance ASC
LIMIT 30;
```
- Filtro de carrera/área: combinar texto del perfil (escuela/intereses) con `skills`/`titulo`;
  empezar permisivo para no vaciar resultados, endurecer si hay volumen.

### 2. Boost
- `score = (1 - distance) + (salario_explicito ? BOOST : 0)`.
- `BOOST` pequeño y constante (premia transparencia sin dominar la relevancia).

### 3. Rerank (Gemini)
```ts
// src/server/ai/rerank.ts  (gemini-2.5-flash, responseSchema)
input: perfil + top-30 (título, empresa, requisitos, salario)
output[]: { job_id, match_score: 0-100, explanation: string, flags: {...} }
```
- `explanation` en español, concreta ("encaja con tu experiencia en X y tu interés en Y").

### 4. Persistencia
- Upsert en `matches` (`user_id`, `job_id`) con `score`, `rerank_score`, `explanation`,
  `flags`, `status` (preservar `saved`/`dismissed` previos del usuario).

### Endpoints
```ts
POST /api/match            → recalcula matches del usuario → { count }
GET  /api/match?filter=... → matches ordenados por rerank_score (para el feed)
PATCH /api/match/:id       → cambia status (seen|saved|dismissed)
```
- Filtros del feed (server-side): `solo_con_salario`, `modalidad`, `ubicacion`.
- Umbral configurable: el feed muestra `rerank_score >= UMBRAL`.

## Contratos
```ts
GET /api/match → { matches: Array<{
    id, rerank_score, explanation,
    job: { titulo, empresa, modalidad, ubicacion,
           salario_min, salario_max, moneda, salario_periodo, salario_explicito, apply_link },
    status
}> }
```

## Criterios de aceptación
- Con perfil + empleos ingestados, `POST /api/match` genera matches con scores plausibles.
- Las vacantes con salario explícito quedan favorecidas (a igualdad de relevancia).
- Cada match trae una explicación en español específica del perfil.
- `PATCH` cambia el estado y persiste entre recalculos.
- Filtros del feed (incl. "solo con salario") funcionan server-side.

## Fuera de alcance
UI del feed (Spec 06). Aprendizaje de preferencias / re-ranking online (YAGNI).

## Verificación
Tras Spec 03 y 04 con datos de prueba: `POST /api/match` → `GET /api/match` con y sin
filtros → cambiar status y recalcular → `pnpm check`.
