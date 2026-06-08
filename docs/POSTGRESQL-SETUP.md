# PostgreSQL — setup (`api/`)

Infraestructura de persistencia del API: **PostgreSQL** con **Prisma**.

## Requisitos

| Componente | Detalle |
|------------|---------|
| Base de datos | PostgreSQL 14+ (local, Docker o managed) |
| Cliente ORM | Prisma 6 (`@prisma/client`) |
| Arranque HTTP | `DATABASE_URL` obligatoria; `server.ts` valida conectividad al iniciar |

## Desarrollo local

```bash
cp .env.example .env
# Editar DATABASE_URL

npm install
npm run prisma:generate
npm run postgres:migrate:deploy   # o postgres:migrate:dev en iteración de esquema
npm run dev
```

Validación opcional: `npm run postgres:validate`

## Migraciones

| Comando | Uso |
|---------|-----|
| `npm run postgres:migrate:dev` | Crear/aplicar migraciones en desarrollo |
| `npm run postgres:migrate:deploy` | Aplicar en CI/producción |
| `npm run postgres:migrate:reset` | Reset destructivo (solo dev) |
| `npm run prisma:generate` | Regenerar cliente tras cambios en `schema.prisma` |

Esquema: `api/prisma/schema.prisma`. Historial: `api/prisma/migrations/`.

## Tests de integración

Requieren Docker (Testcontainers) o `DATABASE_URL_TEST` con `POSTGRES_TEST_USE_ENV=1`.

```bash
npm run test:postgres
```

Ver [`TESTING.md`](./TESTING.md).

## Documentación por dominio

| Dominio | Doc |
|---------|-----|
| Identity | [`POSTGRESQL-IDENTITY.md`](./POSTGRESQL-IDENTITY.md) |
| Workspace | [`POSTGRESQL-WORKSPACE.md`](./POSTGRESQL-WORKSPACE.md) |
| Projects / work items | [`POSTGRESQL-PROJECTS-WORK-ITEMS.md`](./POSTGRESQL-PROJECTS-WORK-ITEMS.md) |
| Scrum / Kanban | [`POSTGRESQL-SCRUM-KANBAN.md`](./POSTGRESQL-SCRUM-KANBAN.md) |
| Guided sessions | [`POSTGRESQL-GUIDED-SESSIONS.md`](./POSTGRESQL-GUIDED-SESSIONS.md) |
| Cierre migración | [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md) |
