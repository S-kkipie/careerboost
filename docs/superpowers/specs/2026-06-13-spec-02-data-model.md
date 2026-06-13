# Spec 02 — Modelo de datos

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 00, 01

## Objetivo

Definir el schema de dominio en Drizzle con columnas `vector(768)` de pgvector y dejar las
migraciones aplicadas. Al final: tablas `profiles`, `jobs`, `matches`, `ingestion_runs`
existen, con índices vectoriales y aislamiento por usuario.

## Alcance

- Schema Drizzle de dominio + tipo `vector` (custom type o helper pgvector).
- Migración que habilita `vector` e crea índices (incl. HNSW para cosine).
- Helpers de consulta tipados para distancia vectorial (`<=>`).

## Diseño técnico

### Tablas
```ts
// profiles — 1 por usuario
profiles {
    user_id            text PK references user.id
    escuela_profesional text
    grado              text          // egresado | bachiller | titulado (MVP: egresado)
    ubicacion          text
    intereses          text[]        // áreas/roles de interés
    expectativa_salarial integer     // soles, opcional
    cv_url             text
    raw_cv_text        text
    embedding          vector(768)
    created_at, updated_at
}

// jobs — vacantes extraídas del buzón del usuario
jobs {
    id                 uuid PK
    user_id            text references user.id     // dueño del buzón
    gmail_msg_id       text                         // único por user (cache de procesados)
    source_sender      text
    titulo             text
    empresa            text
    modalidad          text          // presencial | remoto | híbrido
    ubicacion          text
    salario_min        integer
    salario_max        integer
    moneda             text          // PEN | USD
    salario_periodo    text          // mes | hora | año
    salario_explicito  boolean       // false si "según mercado" / ausente
    requisitos         text
    skills             text[]
    deadline           date
    apply_link         text
    raw_email          text          // recortado; sin secretos
    is_job             boolean
    noise_reason       text          // si is_job=false: por qué se descartó
    dedupe_hash        text
    embedding          vector(768)
    created_at
}

// matches — resultado del motor por usuario/empleo
matches {
    id            uuid PK
    user_id       text references user.id
    job_id        uuid references jobs.id
    score         real        // similitud cruda (post-boost)
    rerank_score  integer     // 0-100 de Gemini
    explanation   text        // "por qué te lo recomendamos"
    flags         jsonb       // señales del rerank
    status        text        // new | seen | saved | dismissed
    created_at
}

// ingestion_runs — métricas para el panel de impacto
ingestion_runs {
    id              uuid PK
    user_id         text references user.id
    started_at, finished_at
    emails_scanned  integer
    jobs_found      integer
    noise_filtered  integer
    dupes_removed   integer
}
```

### Restricciones e índices
- `unique(user_id, gmail_msg_id)` → cache de procesados / re-sync idempotente.
- `unique(user_id, dedupe_hash)` → dedupe de vacantes repetidas.
- Índice HNSW cosine sobre `jobs.embedding` (`vector_cosine_ops`).
- Todas las consultas filtran por `user_id` (no hay RLS; la app aísla).

### Tipo vector + distancia
- Definir `vector(768)` con el helper de drizzle-pgvector o un `customType`.
- Helper tipado `cosineDistance(column, queryEmbedding)` que emite `embedding <=> $1`.

## Criterios de aceptación
- `pnpm db:generate` + `pnpm db:migrate` aplican sin errores.
- La extensión `vector` y el índice HNSW existen (verificable en `db:studio`/psql).
- Insertar y leer un `vector(768)` round-trips correctamente.
- Constraints únicos previenen duplicados de `gmail_msg_id` y `dedupe_hash`.

## Fuera de alcance
Lógica que llena las tablas (specs 03-05).

## Verificación
`pnpm db:generate` → `pnpm db:migrate` → insertar fila de prueba con embedding dummy y
consultar por distancia → `pnpm check`.
