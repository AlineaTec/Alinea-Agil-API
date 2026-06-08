# PostgreSQL — dominio projects y work items

Esquema y repositorios Prisma del núcleo operativo de proyectos y trabajo. **PostgreSQL es la persistencia activa** del runtime HTTP.

## Tablas en PostgreSQL

| Tabla Postgres | Nombre legacy (migración) | Notas |
|----------------|-----------------|--------|
| `project_drafts` | `workspace_project_drafts` | FK `workspace_id` |
| `projects` | `workspace_runtime_projects` | FK `workspace_id`; `source_draft_public_id` |
| `work_items` | `project_scrum_backlog_items` | Tabla unificada (épica/historia/tarea/subtarea); FK `project_id` |
| `work_item_comments` | comentarios de ítem | FK `work_item_id`, `project_id` |
| `work_item_time_entries` | tiempo registrado | Índices por ítem, fecha, usuario |
| `work_activity_notifications` | notificaciones de actividad | FK `project_id`; `recipient` → `identity_users.public_id` |
| `work_item_implicit_follows` | follows implícitos (30 días) | Unique `(workspace_id, user_public_id, work_item_id)` |

Migración: `prisma/migrations/20250607120000_projects_work_items_domain/`

**Fuera de alcance en esta fase (ya cubierto en Fase 4):** sprints, sprint assignments, kanban flow config, guided *sprint planning*. Siguen pendientes: guided sessions daily/refinement/review/retro, impediments, billing, audit, snapshot.

## `work_team_project_links` (transición)

Se adoptó **FK real** a `projects` (`project_id`) y se mantiene **`project_public_id`** denormalizado para consultas y compatibilidad con el modelo de dominio histórico. El unique activo es `(team_id, project_id)`. Insertar un enlace exige que el proyecto exista ya en PostgreSQL.

## Repositorios Prisma

| Repositorio | Ubicación |
|-------------|-----------|
| `ProjectDraftPrismaRepository` | `workspace-projects/persistence/prisma/` |
| `ProjectRuntimePrismaRepository` | `workspace-project-runtime/persistence/prisma/` |
| `ScrumBacklogPrismaRepository` | `project-scrum-backlog/persistence/prisma/` |
| `WorkItemCommentsPrismaRepository` | `work-item-comments/persistence/prisma/` |
| `WorkItemTimeEntriesPrismaRepository` | `work-item-time-logging/persistence/prisma/` |
| `WorkActivityNotificationPrismaRepository` | `work-activity-notifications/persistence/prisma/` |
| `WorkItemImplicitFollowPrismaRepository` | `work-activity-notifications/persistence/prisma/` |
| `WorkTeamProjectLinkPrismaRepository` | actualizado en `workspace-work-teams/persistence/prisma/` |


## Tests

```bash
cd api
npm run test:postgres:projects    # solo projects / work items
npm run test:postgres              # Fase 0 + identity + workspace + projects
```

Archivo: `src/test/postgres/projects-work-items-domain.integration.test.ts`

