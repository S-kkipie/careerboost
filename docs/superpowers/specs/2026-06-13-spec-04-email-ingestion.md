# Spec 04 — Pipeline de ingesta de correos (Gmail)

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 01, 02

## Objetivo

Leer los correos de la bolsa desde el Gmail del usuario, clasificar empleo vs ruido,
extraer cada vacante en formato estandarizado con claridad salarial, deduplicar y generar
embeddings, registrando métricas de impacto. Al final: `jobs` y `ingestion_runs` se pueblan
con datos limpios.

## Alcance

- Recuperación de mensajes vía Gmail API (solo lectura).
- Clasificación ¿es empleo? con Gemini (mata el 27% de ruido).
- Extracción estructurada de vacantes con Gemini (JSON schema).
- Normalización de salario (LLM + fallback regex).
- Deduplicación + cache de procesados.
- Embedding por vacante + registro de `ingestion_runs`.
- Disparo manual (endpoint) y reutilizable por cron (Spec 07).

## Diseño técnico

### Recuperación
```ts
// src/server/services/gmail.ts
// token vía auth.api.getAccessToken (Spec 01)
// users.messages.list  query: from:(SENDERS) newer_than:90d
// SENDERS configurable en env/const (correo(s) de la bolsa UNSA)
// users.messages.get → decodificar body (base64), limpiar HTML → texto
```
- Límite demo: últimos 90 días / N mensajes.
- Saltar mensajes cuyo `gmail_msg_id` ya está en `jobs` (idempotente).

### Clasificación (Gemini)
```ts
// src/server/ai/classify-email.ts  (gemini-2.5-flash, responseSchema)
{ is_job: boolean, noise_reason: string|null }
```
- Si `is_job=false`: guardar registro mínimo (o solo contar) y sumar a `noise_filtered`.

### Extracción (Gemini)
```ts
// src/server/ai/extract-job.ts  (gemini-2.5-flash, responseSchema)
{
  titulo, empresa, modalidad, ubicacion,
  salario: { min, max, moneda, periodo, explicito },
  requisitos, skills[], deadline, apply_link
}
```

### Normalización de salario
- LLM marca `explicito=false` cuando el texto dice "según mercado", "a tratar",
  "remuneración competitiva" o no menciona monto.
- Fallback regex determinista para `S/ 1500`, `1200-1800 soles`, `USD 800`, rangos, etc.,
  que corrige/valida la salida del LLM.

### Dedupe
- `dedupe_hash = hash(normalize(titulo) + empresa + semana(deadline||fecha))`.
- `unique(user_id, dedupe_hash)` evita repetidos; los choques suman a `dupes_removed`.

### Embedding
- `text = titulo + " " + requisitos + " " + skills.join(", ")` → `geminiEmbed` @768.

### Métricas
- Una fila `ingestion_runs` por corrida: `emails_scanned`, `jobs_found`, `noise_filtered`,
  `dupes_removed`, tiempos.

### Endpoint
```ts
POST /api/ingest → corre el pipeline para el usuario actual → { run: ingestion_run }
```
- Procesar en lotes; tolerar fallos por correo (continuar, registrar).

## Contratos
```ts
POST /api/ingest → { run: { emails_scanned, jobs_found, noise_filtered, dupes_removed } }
GET  /api/ingest/last → último ingestion_run (para el panel de impacto)
```

## Criterios de aceptación
- Sobre un buzón de prueba con correos reales/sembrados: clasifica empleo vs ruido
  coherentemente y descarta el ruido.
- Cada vacante guardada tiene campos estandarizados y `salario_explicito` correcto.
- Re-ejecutar `POST /api/ingest` no duplica (cache + dedupe funcionan).
- `ingestion_runs` refleja números reales que el panel pueda mostrar.
- Embeddings de 768 dims presentes en cada `job`.

## Seguridad / privacidad
- Solo lectura. `raw_email` recortado; nunca loguear cuerpos completos ni tokens.
- Aislamiento estricto por `user_id`.

## Fuera de alcance
Match/rerank (Spec 05). Scraping externo, dedupe global (YAGNI).

## Verificación
Conectar Gmail de prueba → `POST /api/ingest` → revisar `jobs`/`ingestion_runs` →
re-ejecutar y confirmar idempotencia → `pnpm check`.
