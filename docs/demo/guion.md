# CareerBoost — Guion de demo (3 min) y preparación

## Preparación (elige una vía)

### Vía A — Seed offline (recomendada, sin Gmail)
1. Inicia sesión una vez en la app con tu cuenta Google (crea el usuario).
2. Corre el seed con tu correo:
   ```
   pnpm db:seed-demo -- --email=tu-correo@example.com
   ```
   Esto crea un perfil de egresado de Ingeniería de Sistemas, ~10 vacantes
   (con y sin salario, distintas modalidades), una corrida de ingesta con la
   métrica de ruido, y ejecuta el match. Tras correrlo, `/feed` y `/digest`
   quedan poblados. Requiere `DATABASE_URL` + `GEMINI_API_KEY` en `.env.local`.

### Vía B — Cuenta Gmail de prueba (auténtica)
1. Crea/usa una cuenta Gmail de prueba.
2. Reenvía 20-40 correos representativos de la bolsa (mezcla: empleos con
   salario, empleos sin salario, y ruido no-empleo). Ver "Correos de ejemplo".
3. En la app: conectar Gmail (solo lectura) → subir CV → sincronizar →
   generar matches.

## Guion (3 minutos)
1. **Problema (20s):** "Un egresado recibe +100 correos al mes. 27% es ruido,
   90% de las vacantes no dicen el salario."
2. **Onboarding (40s):** Conectar Gmail (solo lectura) + subir CV →
   sincronizar. (En modo seed, muestra `/feed` ya poblado.)
3. **Panel de impacto (25s):** escaneados / ruido filtrado / empleos reales /
   para mí — el ruido se ve filtrado.
4. **Feed (45s):** cards con % de match, "por qué te lo recomendamos", badges
   de salario (verde = explícito, gris = no especificado).
5. **Filtro "solo con salario" (20s):** claridad frente al 90% opaco.
6. **Digest (30s):** abre `/digest` → "100+ correos al mes en 1 resumen".
   Marca como visto → la próxima corrida solo trae lo nuevo.

## Correos de ejemplo (para la Vía B)

**Empleo con salario (real):**
```
Asunto: Convocatoria Desarrollador Backend - Arequipa
Empresa TechAQP busca Desarrollador Backend Node.js.
Modalidad remoto. Sueldo S/ 3500 - 4500 mensual.
Requisitos: Node.js, TypeScript, PostgreSQL.
Postular: https://empleos.example/backend-node
```

**Empleo sin salario (real, opaco):**
```
Asunto: Analista de Datos - Oportunidad
Consultora busca Analista de Datos. Modalidad presencial, Arequipa.
Remuneración acorde al mercado.
Requisitos: SQL, Python, Power BI.
```

**Ruido (no es empleo):**
```
Asunto: Webinar gratuito de liderazgo este viernes
Inscríbete al webinar de liderazgo para egresados.
Cupos limitados. No requiere experiencia.
```

## Verificación del cron (opcional)
- Sin secret → 401:
  ```
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/digest
  ```
- Con secret → corre ingesta+match+digest:
  ```
  curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest
  ```
- Con `RESEND_API_KEY` configurado, se envía 1 correo de digest; sin ella,
  degrada a in-app (solo `/digest`).
