# Spec 07 — Digest y preparación del demo

**Fecha:** 2026-06-13 · **Estado:** Aprobado · **Depende de:** Spec 04, 05, 06

## Objetivo

Cerrar el ciclo "anti-saturación": un digest periódico con los nuevos top matches (in-app y
opcionalmente 1 correo), más los datos y el guion para un demo sólido. Al final: el cron
genera digests y el demo se puede correr de principio a fin.

## Alcance

- Job de digest reutilizando ingesta + match.
- Vista in-app de digest (top matches nuevos) + opcional envío por correo.
- Datos de demo (cuenta de prueba con correos representativos).
- Guion de demo de 3 minutos.

## Diseño técnico

### Cron
```ts
// Vercel Cron → GET /api/cron/digest  (protegido con CRON_SECRET)
// por cada usuario con Gmail conectado:
//   ejecutar ingesta (Spec 04) → recalcular match (Spec 05)
//   seleccionar matches nuevos (status=new) top-K
//   registrar/disponibilizar el digest
```
- Frecuencia demo: diaria (configurable). Idempotente gracias al cache/dedupe.
- Proteger el endpoint con `CRON_SECRET` (header).

### Entrega
- **In-app**: vista/sección "Tu digest" con los nuevos top matches desde el último visto.
- **Opcional correo** (Resend): 1 email con los top-K, links a postular. Mensaje clave:
  *"100+ correos/mes → 1 digest."* Si no hay `RESEND_API_KEY`, solo in-app.

### Datos de demo
- Cuenta Gmail de prueba con ~20-40 correos: mezcla de empleos reales (formato bolsa),
  ruido (no-empleos) y vacantes sin salario, para que el panel muestre el contraste
  27% ruido / 90% sin salario de forma visible.
- Alternativa: forward de correos reales de la bolsa a la cuenta de prueba.

### Guion (3 min)
1. Problema: "+100 correos/mes, puro ruido".
2. Conectar Gmail + subir CV → sincronizar.
3. Panel de impacto aparece (escaneados / ruido / reales / para mí).
4. Feed: cards con %, "por qué", badges de salario.
5. Filtro "solo con salario" → claridad vs 90% opaco.
6. Digest: "1 correo a la semana en vez de 100".

## Criterios de aceptación
- `GET /api/cron/digest` (con secret) corre ingesta+match y arma el digest sin error.
- Sin secret, el endpoint rechaza (401).
- La vista de digest muestra solo matches nuevos.
- Con `RESEND_API_KEY`, se envía 1 correo de digest; sin ella, degrada a in-app.
- El demo completo corre de inicio a fin con la cuenta de prueba.

## Fuera de alcance
WhatsApp/push, preferencias de frecuencia por usuario, plantillas de correo ricas (YAGNI).

## Verificación
Llamar al cron con/ sin secret → revisar digest in-app → (si hay key) revisar correo →
ensayar el guion completo → `pnpm build` + `pnpm check`.
