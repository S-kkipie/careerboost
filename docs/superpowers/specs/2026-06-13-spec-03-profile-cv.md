# Spec 03 — Perfil del egresado (CV)

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 00, 01, 02

## Objetivo

El egresado sube su CV en PDF; Gemini lee el PDF directamente, extrae un perfil
estructurado, el usuario lo corrige en un form, y se genera el embedding del perfil. Al
final: existe una fila `profiles` completa con `embedding vector(768)`.

## Alcance

- Endpoint de subida de CV (PDF) + almacenamiento del archivo.
- Extracción de perfil con Gemini multimodal (PDF como input, sin lib de parseo).
- Persistencia + edición del perfil (campos corregibles).
- Generación del embedding del perfil.

## Diseño técnico

### Subida
- `POST /api/profile/cv` (multipart) → guarda el PDF (disco local en dev / blob store), set
  `profiles.cv_url`.
- Validar tipo/size (PDF, ≤ ~10MB).

### Extracción (Gemini multimodal)
```ts
// src/server/ai/extract-profile.ts
// model: gemini-2.5-flash, input: PDF bytes, responseSchema (JSON)
profileSchema = {
    escuela_profesional: string,
    grado: enum("egresado","bachiller","titulado"),
    ubicacion: string,
    skills: string[],
    experiencia_resumen: string,
    intereses: string[],          // roles/áreas objetivo inferidos
}
```
- Se envía el PDF directo a Gemini (acepta PDF). Sin `pdf-parse`.
- Salida **siempre** vía `responseSchema` (JSON mode).
- `raw_cv_text`: opcionalmente el texto plano que devuelva el modelo (para depurar).

### Edición
- `GET /api/profile` → perfil actual.
- `PUT /api/profile` → guarda correcciones del usuario + `expectativa_salarial`.
- La UI de edición vive en Spec 06.

### Embedding del perfil
```ts
// src/server/ai/embed.ts
text = [escuela_profesional, skills.join(", "), experiencia_resumen, intereses.join(", ")]
embedding = geminiEmbed(text)   // gemini-embedding-2, outputDimensionality: 768
```
- Recalcular embedding cuando el usuario edita campos relevantes.

## Contratos
```ts
POST /api/profile/cv   (multipart file) → { profile, extracted: true }
GET  /api/profile      → { profile }
PUT  /api/profile      (json) → { profile }
```

## Criterios de aceptación
- Subir un CV PDF real produce un perfil con campos poblados.
- Editar y guardar persiste los cambios.
- `profiles.embedding` se genera y tiene 768 dimensiones.
- Reintentar subida actualiza (no duplica) la fila del usuario.

## Seguridad / privacidad
- El CV es del usuario y se aísla por `user_id`. No exponer archivos de otros usuarios.
- No loguear contenido del CV.

## Fuera de alcance
Matching (Spec 05). Subida múltiple de CVs / versiones (YAGNI).

## Verificación
Subir CV de prueba → revisar perfil extraído → editar → confirmar embedding 768 en DB →
`pnpm check`.
