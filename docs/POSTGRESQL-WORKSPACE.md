# PostgreSQL — dominio workspace y organización

Esquema y repositorios Prisma del núcleo organizacional. **PostgreSQL es la persistencia activa** del runtime HTTP.

## Tablas en PostgreSQL

| Tabla Postgres | Nombre legacy (migración) | Notas |
|----------------|-----------------|--------|
| `workspaces` | `workspace_records` | `slug` = código único (antes `code` en legacy) |
| `workspace_owner_memberships` | `workspace_owner_memberships` | Provisioning owner; **≠** `workspace_members` |
| `workspace_members` | `workspace_members` | Membresía operativa (asientos, roles) |
| `workspace_invitations` | `workspace_invitations` | Índice parcial único pending+email |
| `workspace_licenses` | `workspace_licenses` | 1:1 con workspace |
| `work_teams` | `work_teams` | |
| `work_team_memberships` | `work_team_memberships` | Índice parcial único activo+usuario |
| `work_team_project_links` | `work_team_project_links` | FK `project_id` + `project_public_id` denormalizado (Fase 3) |

Migración: `prisma/migrations/20250606120000_workspace_domain/`

## Owner vs member (no fusionar)

- **`workspace_owner_memberships`**: vínculo de provisioning del owner inicial (rol fijo `owner`).
- **`workspace_members`**: membresía operativa (estado, asiento, roles admin/metodológicos).

En el alta pagada se crean **ambos** para el mismo usuario; son filas distintas con propósitos distintos.

## Repositorios Prisma

| Repositorio | Ubicación |
|-------------|-----------|
| `WorkspacePrismaRepository` | `registro-onboarding/persistence/prisma/` |
| `WorkspaceOwnerMembershipPrismaRepository` | `registro-onboarding/persistence/prisma/` |
| `WorkspaceIdentityPrismaRepository` | `workspace-users/persistence/prisma/` |
| `WorkspaceMemberPrismaRepository` | `workspace-users/persistence/prisma/` |
| `WorkspaceInvitationPrismaRepository` | `workspace-invitations/persistence/prisma/` |
| `WorkspaceLicensePrismaRepository` | `workspace-licenses/persistence/prisma/` |
| `WorkTeamPrismaRepository` | `workspace-work-teams/persistence/prisma/` |
| `WorkTeamMembershipPrismaRepository` | `workspace-work-teams/persistence/prisma/` |
| `WorkTeamProjectLinkPrismaRepository` | `workspace-work-teams/persistence/prisma/` |


## Tests

```bash
cd api
npm run test:postgres:workspace    # solo workspace
npm run test:postgres              # Fase 0 + identity + workspace
```

**Base de datos de prueba:**

- Por defecto: Testcontainers (Docker).
- Opcional: `DATABASE_URL_TEST=postgresql://…` apunta a Postgres local/CI (aplica migraciones al inicio).
- Alternativa: `POSTGRES_TEST_USE_ENV=1` + `DATABASE_URL` en `.env`.

## Migraciones — nota sobre drift

Existe `prisma/migrations/20260604180246_init/`: solo renombra índices largos de la fase identity (generado por `prisma migrate dev`). No añade tablas; el árbol sigue coherente si se aplica en orden.

Ver: [`POSTGRESQL-SETUP.md`](./POSTGRESQL-SETUP.md), [`POSTGRESQL-IDENTITY.md`](./POSTGRESQL-IDENTITY.md), [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md).
