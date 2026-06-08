# project-scrum-sprint-planning

Backend MVP de **planificación de sprint Scrum**: entidad de sprint, **membresía sprint–ítem** como fuente de verdad, persistencia PostgreSQL, servicio y rutas HTTP alineadas a `contracts-docs/docs/modules/project-scrum-sprint-planning/`.

## Alcance actual

- Estados persistidos: `planning`, `ready_for_execution`, `active`, `closed`. Solo se opera de punta a punta con **planning** y **ready_for_execution** (`active` / `closed` reservados).
- Reglas: un sprint en **planning** por proyecto; uno en **ready_for_execution**; pasar a ready exige **goal** y **fechas**; edición y compromiso de ítems solo en **planning**; solo **user_story** y **task**; conflicto si el ítem ya está en otro sprint no cerrado (`planning` | `ready_for_execution` | `active`).
- Autorización: delegada en backlog — **lectura** `assertCanReadSprintPlanning` → `assertCanReadScrumBacklog`; **mutación** `assertCanMutateSprintPlanning` → `assertCanMutateScrumBacklog` (ver `harmonization-decisions.md` en contracts-docs).
- Proyecto: `ProjectRuntimeService.requireScrumWorkspaceRuntimeProject` antes de operar.

## Rutas (`/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista sprints del proyecto |
| POST | `/` | Crea sprint (`name`, `goal?`, `startDate?`, `endDate?` como `YYYY-MM-DD`) |
| GET | `/:sprintPublicId` | Detalle |
| PATCH | `/:sprintPublicId` | Actualización parcial (solo si `planning`) |
| POST | `/:sprintPublicId/ready` | Marca `ready_for_execution` |
| POST | `/:sprintPublicId/revert-to-planning` | Vuelve a `planning` |
| GET | `/:sprintPublicId/items` | Ítems comprometidos (membresía + resumen de backlog: `storyPoints`, `priorityLevel`, etc.) |
| POST | `/:sprintPublicId/items` | Body `{ backlogItemPublicId }` |
| DELETE | `/:sprintPublicId/items/:backlogItemPublicId` | Quita compromiso (solo `planning`) |

## Estructura del módulo

- `domain/` — tipos, estados del sprint, errores
- `persistence/` — esquemas de tipos, repositorio
- `services/` — `SprintPlanningService`
- `validation/` — esquemas Zod HTTP
- `policies/` — autorización
- `routes/` — router Express

## Fuera de alcance (por diseño)

Tablero de sprint, ejecución diaria, transición completa a `active`, métricas, capacidad, velocity, cierre de sprint.
