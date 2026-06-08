# API (Alinea Ágil)

Backend REST de **Alinea Ágil**: **Node.js ≥ 20**, **TypeScript (ESM)**, **Express** y **PostgreSQL (Prisma)**. Expone la lógica de negocio para el cliente workspace (`web/`), el panel de plataforma (`admin/`) y flujos públicos (registro, login, invitaciones, retrospectiva guiada).

## Stack y requisitos

| Componente | Detalle |
|------------|---------|
| Runtime | Node.js **≥ 20** |
| HTTP | Express 4, CORS, Helmet, rate limiting por IP |
| Persistencia | PostgreSQL con Prisma |
| Validación | Zod en DTOs HTTP |
| Observabilidad | Sentry (producción), logs estructurados opcionales (`LOG_FORMAT=json`) |
| Correo | Resend vía módulo `transactional-email` |
| Pagos | Paddle Billing (checkout, webhooks, portal de cliente) |
| Antiabuso | Cloudflare Turnstile en login y pasos críticos de registro |
| Tests | `node:test` + **tsx** — **99** suites colocalizadas bajo `src/` |

## Papel en el monorepo

| Paquete | Consumo del API |
|---------|-----------------|
| `web/` | Workspace: auth Bearer de usuario registrado, proyectos Scrum/Kanban, ceremonias guiadas, billing, miembros |
| `admin/` | Plataforma: sesión Bearer distinta bajo `/v1/platform/*` |
| Público | Registro, login, recuperación de contraseña, invitaciones, join de retrospectiva |

Variable típica en front: `VITE_REGISTRATION_API_BASE_URL` (o equivalente por módulo). En producción el API exige **`CORS_ORIGINS`** explícito y Turnstile cuando corresponda.

## Arquitectura

```
src/
├── server.ts              # Proceso local: Prisma → createApp() → listen
├── vercel.ts              # Handler serverless (Vercel)
├── prepare-http-application.ts
├── app.ts                 # Composición de módulos y wiring de servicios
├── config/                # Entorno, detección productivo
├── integrations/paddle/   # Cliente REST, firma webhook, portal
├── http-rate-limit.ts
├── scripts/               # Seeds, utilidades Prisma, diagnóstico
└── modules/               # ~60 módulos de dominio (ver abajo)
```

Cada módulo suele organizarse en capas:

- `domain/` — tipos, políticas y errores de negocio
- `persistence/` — puertos, schemas de tipos (`*DocProps`), repositorios
- `services/` — casos de uso
- `routes/` — Express routers
- `*.module.ts` — montaje y ensamblaje de dependencias
- `README.md` — contrato HTTP y decisiones del slice

El ensamblaje central vive en **`src/app.ts`**: conecta billing, licencias, usuarios, proyectos, tableros, métricas, ceremonias guiadas, plataforma admin y jobs periódicos (p. ej. barrido de gracia de facturación).

## Superficie HTTP (prefijos)

| Prefijo | Auth | Descripción |
|---------|------|-------------|
| `GET /health` | — | Salud del servicio `{ status: "ok" }` |
| `/v1/auth/*` | Público / Bearer usuario | Login, logout, `GET /me`, perfil, workspace activo, recuperación de contraseña |
| `/v1/public/registration/*` | Público (+ Turnstile en pasos críticos) | Registro onboarding (elegibilidad → verificación → workspace → credenciales → pago → activación) |
| `/v1/public/registration-payment/paddle-complete` | Público | Alias de confirmación Paddle en registro |
| `/v1/platform/*` | Bearer plataforma | Admin: tenants, usuarios plataforma, billing agregado, licencias, auditoría, observabilidad |
| `/v1/workspaces/:workspacePublicId/*` | Bearer usuario + membresía | Miembros, invitaciones, licencias, settings, billing, proyectos, equipos |
| `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/*` | Bearer + rol proyecto | Backlog Scrum/Kanban, sprints, tableros, métricas, impedimentos, ceremonias |
| `/v1/integrations/paddle/webhooks` | Firma Paddle | Ingesta de eventos Billing (body JSON crudo) |
| Rutas públicas guiadas | Rate limit | Join de retrospectiva guiada (sin sesión workspace) |

Documentación detallada por área:

- **Login / sesión:** [`src/modules/login-session/README.md`](src/modules/login-session/README.md)
- **Registro:** [`src/modules/registro-onboarding/README.md`](src/modules/registro-onboarding/README.md)
- **Admin plataforma:** [`src/modules/platform/README.md`](src/modules/platform/README.md)
- **Billing workspace:** [`src/modules/billing-seat-enforcement/README.md`](src/modules/billing-seat-enforcement/README.md)
- **Invitaciones / WMI:** [`src/modules/workspace-invitations/README.md`](src/modules/workspace-invitations/README.md)

Contratos funcionales ampliados (OpenAPI / needs): repositorio **contracts-docs** en `docs/modules/`.

## Desarrollo local

```bash
cp .env.example .env
# DATABASE_URL obligatoria — ver docs/POSTGRESQL-MIGRATION-CLOSURE.md
# npm run postgres:migrate:deploy

npm install
npm run dev
```

Por defecto escucha en **`http://127.0.0.1:3000`**. CORS local: si omites `CORS_ORIGINS`, se permiten `localhost:5173` (web) y `5174` (admin).

### Primera vez (PostgreSQL)

Configura en `.env`:

- `DATABASE_URL`
- `PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL`
- `PLATFORM_BOOTSTRAP_SUPER_ADMIN_PASSWORD` (≥ 10 caracteres)

Luego, **una** de estas opciones crea el primer super admin:

- Arrancar con `npm run dev` (bootstrap automático si `platform_users` está vacía)
- `npm run seed:platform` (idempotente; requiere PostgreSQL)

Ver **[docs/POSTGRESQL-MIGRATION-CLOSURE.md](./docs/POSTGRESQL-MIGRATION-CLOSURE.md)** y `npm run postgres:migrate:deploy`.

### Datos de desarrollo (seed PostgreSQL)

Para poblar la base en **local/dev** con datos determinísticos y repetibles:

1. `DATABASE_URL` en `.env` apuntando a tu Postgres de desarrollo (nunca producción).
2. Migraciones aplicadas: `npm run postgres:migrate:deploy`.
3. Ejecutar con **`ALLOW_DB_SEED=1`** (evita corridas accidentales).

| Objetivo | Comando |
|----------|---------|
| Reset + seed ACME (recomendado) | `npm run db:reset:demo` |
| Solo vaciar BD | `npm run db:reset` |
| Solo seed (BD ya limpia) | `npm run seed` |

Workspace **ACME S.A.** (`acme-demo`): Kanban + Scrum, guided sessions, comentarios, métricas, auditoría, etc. Detalle en `docs/POSTGRESQL-SEED.md`. Login: `pruebas@alineatec.com`.

| Variable | Uso | Default (ver `credentials.ts`) |
|----------|-----|--------------------------------|
| `ALLOW_DB_SEED` | Incluida en scripts `seed` / `db:reset:demo` | — |
| `SEED_USER_PASSWORD` | Usuarios workspace | `ACME!Prueb4s_At3c_7vQ#2026` |
| `SEED_PLATFORM_PASSWORD` | Admin plataforma `agil@alineatec.com` | `Ag1l!Platf0rm_At3c_9xK#2026` |

Ejecutar sobre **base limpia** (`db:reset:demo`). `db:reset` solo vacía la BD (`prisma migrate reset`). Solo desarrollo.

Detalle, estructura de código y validación: **[docs/POSTGRESQL-SEED.md](./docs/POSTGRESQL-SEED.md)**.

### Comprobaciones rápidas

```bash
curl -s http://127.0.0.1:3000/health
npm run build
npm test
```

## Scripts npm

| Comando | Uso |
|---------|-----|
| `npm run dev` | Desarrollo con recarga (`tsx watch src/server.ts`) |
| `npm run build` | Compila a `dist/` (`tsc`) |
| `npm start` | Producción local: `node dist/server.js` |
| `npm test` | Todos los `src/**/*.test.ts` |
| `npm run seed:platform` | Upsert del super admin desde env (PostgreSQL) |
| `npm run seed` / `seed:demo` | Seed ACME S.A. (BD limpia) |
| `npm run db:reset` | `migrate reset` — BD vacía |
| `npm run db:reset:demo` | Reset + seed ACME (recomendado en local) |
| `npm run postgres:migrate:deploy` | Aplica migraciones Prisma |
| `npm run postgres:migrate:dev` | Migraciones en desarrollo |
| `npm run test:postgres` | Integración con Testcontainers |
| `npm run internal:otp-from-code-hash` | Diagnóstico interno OTP (solo operaciones) |

## Variables de entorno

Referencia completa: **[`.env.example`](./.env.example)**.

Grupos principales:

| Grupo | Variables clave |
|-------|-----------------|
| Servidor | `PORT`, `DATABASE_URL` (obligatoria) |
| CORS | `CORS_ORIGINS` (obligatorio explícito en productivo) |
| Turnstile | `TURNSTILE_SECRET_KEY` (obligatoria en productivo) |
| Rate limit | `TRUST_PROXY`, `RATE_LIMIT_*`, `RATE_LIMIT_DISABLED` |
| Registro | `REGISTRATION_*`, peppers OTP/contraseña |
| Sesión | `LOGIN_SESSION_TTL_MS` |
| Plataforma | `PLATFORM_BOOTSTRAP_*`, `PLATFORM_ADMIN_PUBLIC_BASE_URL` |
| Correo | `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_*` |
| Workspace URLs | `WORKSPACE_APP_PUBLIC_BASE_URL`, `PASSWORD_RESET_TTL_MS` |
| Paddle | `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_*`, `PAYMENT_GATEWAY_*` |
| Sentry | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_DEBUG_ROUTES` (solo dev) |

## Seguridad en producción

En entornos productivos (`VERCEL=1`, `NODE_ENV=production`, `APP_ENV=production` o `SENTRY_ENVIRONMENT=production`; no aplica con `NODE_ENV=test`):

- **No arranca** sin **`TURNSTILE_SECRET_KEY`** — login workspace/plataforma y registro crítico validan token con Cloudflare.
- **`CORS_ORIGINS`** debe ser lista explícita de orígenes; **`*` está prohibido**.
- Cabeceras con **Helmet** (CSP/COEP desactivados para API JSON).
- **`X-Robots-Tag: noindex`** en todas las respuestas + `GET /robots.txt`.
- Rate limiting por IP en login, registro crítico, reset de contraseña y join público de retrospectiva.

Detección de entorno: `src/config/production-environment.ts`.

## Módulos de dominio (inventario)

Agrupación orientativa de `src/modules/`:

### Identidad, acceso y onboarding

| Módulo | Rol |
|--------|-----|
| `login-session` | Auth email/contraseña, sesión Bearer, perfil, reset password |
| `registro-onboarding` | Flujo público de alta de workspace |
| `workspace-users` | Miembros, roles, `GET /auth/me` resolution |
| `workspace-invitations` | Invitaciones y aceptación pública |
| `workspace-settings` | Preferencias del workspace |
| `transactional-email` | Plantillas y envío Resend |

### Plataforma (`/v1/platform`)

| Módulo | Rol |
|--------|-----|
| `platform-users` | Auth plataforma, MFA TOTP, gestión de identidades |
| `platform-tenants` | Tenants ↔ workspaces |
| `platform-billing` | MRR/ARR agregado |
| `platform-licensing` | Lectura operativa de licencias |
| `platform-registration-payments` | Intentos de registro con Paddle |
| `platform-registration-intents` | Purga y borrado de intents |
| `platform-audit` | Eventos de auditoría plataforma |
| `platform-observability` | KPIs y salud agregada |
| `platform-billing-operations` | Operaciones billing extendidas (admin) |

Índice transversal: [`src/modules/platform/README.md`](src/modules/platform/README.md).

### Comercial y billing workspace

| Módulo | Rol |
|--------|-----|
| `billing-seat-enforcement` | Estado billing, checkout Paddle, portal, webhooks, enforcement de asientos |
| `workspace-licenses` | Entitlement operativo (asientos, planes) |
| `commercial-pricing` | Catálogo y estimaciones (Individual / Team) |
| `payment-receipts` | Recibos y puente post-pago |
| `workspace-audit-log` | Auditoría por workspace |

### Workspace y proyectos

| Módulo | Rol |
|--------|-----|
| `workspace-projects` | Borradores y materialización |
| `workspace-project-runtime` | Proyectos operativos materializados |
| `workspace-work-teams` | Equipos de trabajo |
| `work-item-assignment` | Asignación de ítems |
| `work-item-comments` | Comentarios |
| `work-item-time-logging` | Registro de horas |
| `work-activity-notifications` | Notificaciones de actividad |
| `work-ready-done-controls` | Controles Ready/Done configurables |
| `project-operating-snapshot` | Snapshot operativo / NBA |

### Scrum

| Módulo | Rol |
|--------|-----|
| `project-scrum-backlog` | Backlog de producto |
| `project-scrum-sprint-planning` | Planificación de sprint |
| `project-scrum-sprint-board` | Tablero de sprint |
| `project-scrum-sprint-closure` | Cierre de sprint |
| `project-scrum-sprint-metrics` | Métricas de sprint |
| `project-scrum-burndown-velocity` | Burndown y velocity |
| `project-scrum-sprint-review` | Sprint review |
| `project-scrum-sprint-retrospective` | Retrospectiva de sprint |
| `project-scrum-carryover` | Derivación de carryover |
| `project-impediments` | Impedimentos |

### Kanban

| Módulo | Rol |
|--------|-----|
| `project-kanban-core` | Flujo Kanban |
| `project-kanban-backlog` | Backlog Kanban |
| `project-kanban-board` | Tablero |
| `project-kanban-wip-limits` | Límites WIP |
| `project-kanban-metrics` | Métricas de flujo |
| `project-kanban-permissions` | Políticas de lectura/escritura |
| `project-cycle-lead-time` | Lead/cycle time |
| `board-column-item-movement` | Movimiento entre columnas |
| `project-rhythm-and-tracking` | Ritmo y seguimiento |

### Ceremonias guiadas

| Módulo | Rol |
|--------|-----|
| `daily-alignment` | Daily alignment |
| `guided-refinement` | Refinement guiado |
| `guided-review` | Review guiada |
| `guided-retrospective` | Retrospectiva guiada (+ join público) |
| `guided-sprint-planning` | Planning guiado |

### Métricas de equipo

| Módulo | Rol |
|--------|-----|
| `team-operational-metrics` | Métricas operativas |
| `team-flow-delivery-metrics` | Flow y entrega |
| `team-predictability-metrics` | Predictabilidad |

### Producto y feedback

| Módulo | Rol |
|--------|-----|
| `product-feedback` | Feedback del usuario autenticado |
| `product-idea-feedback` | Ideas de producto (workspace + plataforma) |

Cada carpeta con `README.md` documenta rutas, permisos y decisiones del slice.

## Pruebas automatizadas

```bash
npm test
```

- Runner: **`node:test`** vía **tsx** (sin compilación previa).
- Convención: `{nombre}.test.ts` colocalizado; repositorios en memoria (`Mem*`) o stubs.
- Alcance MVP, huecos conocidos y CI: **[docs/TESTING.md](./docs/TESTING.md)**.

Pipeline recomendado:

```bash
npm ci && npm run build && npm test
```

## Despliegue

### Proceso Node (VM, contenedor, etc.)

```bash
npm ci
npm run build
npm start
```

Requiere PostgreSQL accesible y migraciones aplicadas (`npm run postgres:migrate:deploy`).

### Vercel (serverless)

- **Root Directory:** carpeta `api/`
- **Build:** `npm run build` → `dist/`
- **Entrada:** `api/index.ts` → `dist/vercel.js`
- **`vercel.json`:** rewrite `/(.*)` → función serverless; `trust proxy` con `VERCEL=1`
- **`PORT`** no aplica en este modo

Variables de entorno se configuran en el dashboard de Vercel (mismas familias que `.env.example`).

## PostgreSQL

- Arranque y cierre de migración: **[docs/POSTGRESQL-MIGRATION-CLOSURE.md](./docs/POSTGRESQL-MIGRATION-CLOSURE.md)**
- Setup local y Prisma: **[docs/POSTGRESQL-SETUP.md](./docs/POSTGRESQL-SETUP.md)**
- Seed y reset de datos de desarrollo: **[docs/POSTGRESQL-SEED.md](./docs/POSTGRESQL-SEED.md)**
- Activación de registro y demás flujos usan **transacciones Prisma**.

En **Vercel serverless**, evita saturar el pool de la base: limita previews contra producción y usa `DATABASE_URL` acotada por entorno.

## Referencias

| Recurso | Ubicación |
|---------|-----------|
| Variables de entorno | `.env.example` |
| Persistencia PostgreSQL | `docs/POSTGRESQL-MIGRATION-CLOSURE.md` |
| Seed / reset (dev) | `docs/POSTGRESQL-SEED.md` |
| Testing | `docs/TESTING.md` |
| Contratos funcionales | `contracts-docs/docs/modules/` |
| Cliente workspace | `../web/README.md` |
| Admin plataforma | `../admin/README.md` |
