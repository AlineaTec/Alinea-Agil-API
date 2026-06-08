# Pruebas automatizadas (API) — MVP

Documentación para cerrar entrega: **cómo ejecutar**, **qué cubren** las suites y **qué queda fuera** del alcance en esta fase.

## Requisitos

- **Node.js ≥ 20**
- Dependencias instaladas: `npm install` en `api/`

## Comando principal

Desde el directorio `api/`:

```bash
npm test
```

El script descubre archivos `src/**/*.test.ts` **excepto** `src/test/**` (integración Postgres y futuras suites con dependencias externas) y los ejecuta con el test runner integrado de Node (`node:test`) vía **tsx** (TypeScript sin paso de compilación previo).

Verificación rápida tras cambios en dominio crítico (billing, licencias, auditoría):

```bash
find src -name '*.test.ts' -print0 | xargs -0 npx tsx --test
```

## Convenciones

| Aspecto | Detalle |
|--------|---------|
| Runner | `node:test` (`import { test } from "node:test"` o `describe`/`it`) |
| Aserciones | `node:assert/strict` |
| Ubicación | Colocal `{module}.test.ts` junto al código bajo `src/` |
| Dependencias externas | Tests unitarios **no** levantan PostgreSQL ni servidor HTTP salvo que el fichero lo documente explícitamente |
| Datos | Repositorios en memoria (`Mem*`) o stubs para aislar servicios |
| Carga / límites HTTP | Los tests unitarios no ejercitan rate limiting; para estrés sobre login/registro usar entorno con `RATE_LIMIT_DISABLED=true` o límites altos vía `.env` |

## Inventario por área (orientativo)

Las suites están repartidas en `src/modules/**`, `src/config/`, `src/integrations/`. Agrupación útil para MVP:

- **Registro y onboarding** — flujo verificación email, políticas relacionadas.
- **Login / sesión** — cubierto indirectamente vía módulos que consumen auth; *sin suite HTTP end-to-end dedicada en esta lista*.
- **Plataforma** — `platform-users`, `platform-tenants`, `platform-billing`, `platform-licensing`, `platform-audit`, `platform-observability`, `platform-billing-operations`.
- **Workspace — usuarios, licencias, billing Paddle** — seat enforcement, webhooks Paddle, portal de cliente, reconciliación comercial; **auditoría de licencias** (`workspace-license.service.audit.test.ts`).
- **Proyecto Scrum / Kanban** — backlog, tableros, métricas, WIP, impediments, burndown, etc.
- **Equipos y asignación** — work teams, work item assignment, comentarios, time entries.
- **Controles y ready/done** — políticas y evaluadores.
- **Email transaccional** — plantillas, layout, servicio, env.
- **Integraciones Paddle** — firma webhook, origen API (`paddle-api-base`).

El número exacto de casos puede consultarse con la salida de `npm test` (resumen `tests` / `pass`).

## Cobertura MVP — decisiones conscientes

**Incluido (automático):**

- Lógica de dominio y servicios con **dobles en memoria**.
- Políticas de autorización puras (sin HTTP).
- Normalización / parsing (Paddle, períodos de billing, etc.).

**Integración PostgreSQL (Fase 0 migración):**

- `npm run test:postgres` — PostgreSQL real vía **Testcontainers** (Fase 0–5).
- `npm run test:postgres:identity` — solo repos Prisma de identity.
- `npm run test:postgres:workspace` — solo repos Prisma de workspace/organización.
- `npm run test:postgres:projects` — solo repos Prisma de projects / work items.
- `npm run test:postgres:scrum-kanban` — solo repos Prisma de Scrum/Kanban operativo.
- `npm run test:postgres:guided-sessions` — solo repos Prisma de guided sessions (daily, refinement, review, retro).
- `npm run test:postgres:persistence-switch` — switch runtime identity + workspace (drivers, login, provisioning).
- `npm run test:postgres:operating-consumers-alignment` — snapshot + team metrics alineados con `runtimePersistence`.
- `npm run test:postgres` — todos los tests bajo `src/test/postgres/` (Prisma + Testcontainers).
- Inventario y criterio de salida: [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md).
- Requiere **Docker** (o `DATABASE_URL_TEST` / `DATABASE_URL` con `POSTGRES_TEST_USE_ENV=1`). No forma parte de `npm test`; ver [`POSTGRESQL-SETUP.md`](./POSTGRESQL-SETUP.md), [`POSTGRESQL-IDENTITY.md`](./POSTGRESQL-IDENTITY.md), [`POSTGRESQL-WORKSPACE.md`](./POSTGRESQL-WORKSPACE.md), [`POSTGRESQL-PROJECTS-WORK-ITEMS.md`](./POSTGRESQL-PROJECTS-WORK-ITEMS.md), [`POSTGRESQL-SCRUM-KANBAN.md`](./POSTGRESQL-SCRUM-KANBAN.md), [`POSTGRESQL-GUIDED-SESSIONS.md`](./POSTGRESQL-GUIDED-SESSIONS.md), [`POSTGRESQL-RUNTIME-SWITCH.md`](./POSTGRESQL-RUNTIME-SWITCH.md).

**No incluido (pendiente post-MVP o manual):**

- **E2E HTTP** contra Express real + PostgreSQL de test (contrato OpenAPI / supertest / Playwright API).
- **UI** (`admin/`, `web/`): no hay `npm test` configurado en esos paquetes en MVP; QA manual o herramientas externas.
- **Cobertura de código** (`c8` / `istanbul`): no está cableada; se puede añadir si el equipo lo prioriza.

## Añadir una prueba nueva

1. Crear `*.test.ts` bajo `src/` (idealmente junto al módulo).
2. Ejecutar `npm test`; no hace falta registrar el archivo en `package.json`.
3. Para dominios sensibles (billing, licencias, auditoría), preferir **casos que fijen comportamiento observable** (payloads de audit, transiciones de estado) con repos Prisma o dobles en memoria.

## CI recomendado

En pipeline (GitHub Actions, etc.):

```bash
cd api && npm ci && npm run build && npm test
```

Fallar el job si `npm test` devuelve código distinto de cero.

En entornos **Windows** sin `find`/`xargs`, ejecutar bajo Git Bash o WSL, o invocar explícitamente los `.test.ts` necesarios con `npx tsx --test <rutas>`.

## Referencias de módulo

- Auditoría workspace (colección, categorías): `src/modules/workspace-audit-log/README.md`
- Billing / asientos: `src/modules/billing-seat-enforcement/README.md`
