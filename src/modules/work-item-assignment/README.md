# work-item-assignment (API)

Asignación operativa de trabajo a **persona** (no a equipo) en ítems de backlog, alineada a `contracts-docs/docs/modules/project-work-assignment/`.

## Qué significa asignar (v1)

- Un único **asignado opcional** por work item: `assignedUserPublicId` + `assignmentUpdatedAt` + `assignmentUpdatedByUserPublicId` en el ítem, más historial embebido.
- Es **responsabilidad operativa**; **no** otorga permisos extra ni es autoridad.
- Universo de candidatos: misma base que `GET …/members/assignable-for-work-items`, **intersectada** con miembros activos de equipos de trabajo **active** vinculados al proyecto; una persona en varios equipos aparece **una vez** con `sourceTeams` en el listado de asignables.

## Qué no es

- No es asignación a equipo, ni capacity planning, ni múltiples asignados, ni asignación masiva.
- **Épicas** no son asignables en v1; **user story**, **task** y **subtask** sí.

## Proyecto sin equipos vinculados

Si no hay vínculo proyecto–equipo, **no** hay asignación válida: mutaciones con nuevos asignados fallan con `ASG_PROJECT_HAS_NO_LINKED_TEAMS` (HTTP 422). El `GET` de asignables devuelve `members: []` y `projectTeamLinkCount: 0`.

## Equivalencia Kanban

Los roles de workspace son compartidos (no hay rol Kanban distinto en el modelo de miembro). La misma capa aplica a proyectos operativos Scrum y Kanban que usan el mismo repositorio de ítems.

## Servicios

- `WorkItemAssignmentService`: leer, asignar, reasignar, desasignar, autoasignación, auto-desasignación, historial, `listProjectAssignables`, y `patchWorkItemAssignment` (cuerpo `assigneeUserPublicId: string | null`).
- `ProjectAssignableUsersService`: `listAssignablesForProject` (unión deduplicada, equipos `active` solamente) y comprobaciones de universo.

## Endpoints

### Bajo backlog (scrum o kanban, `mergeParams`)

- `GET|PATCH …/items/:backlogItemPublicId/assignment`
- `GET …/items/:backlogItemPublicId/assignment/history`
- POST/DELETE históricos (compat) ver rutas en `work-item-assignment.routes.ts`

### Bajo proyecto (debe ir antes de `.../summary` en el árbol de Express)

- `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/assignables`  
  Respuesta `members[]`: mismo criterio que `GET …/members/assignable-for-work-items` (`userPublicId`, `fullName`, `emailNormalized`), filtrado a quienes tienen membresía **activa** en equipos **active** vinculados al proyecto (el listado de miembresía va por `teamPublicId` del vínculo, no se re-filtra por el campo `workspacePublicId` de la fila de membresía, para alinear con el roster del equipo). Cada fila añade roles de workspace y `sourceTeams[]` con `teamName`, `teamPublicId` e `isTeamLead`.
- `PATCH /v1/workspaces/:workspacePublicId/projects/:projectPublicId/work-items/:workItemPublicId/assignment`  
  Body: `{ "assigneeUserPublicId": "<uuid>" | null }` (misma semántica que `backlogItemPublicId` en Scrum)

## Filtros de listado (backlog)

Query opcional (Scrum y Kanban backlog) en `GET .../items`:

- `unassigned=true`
- `assignee=me`
- `assigneeUserPublicId=<uuid>`

Se combinan con **AND** si vienen juntos.

## Errores de negocio (prefijo `ASG_`, HTTP 422)

Incluyen entre otros: `ASG_PROJECT_HAS_NO_LINKED_TEAMS`, `ASG_ASSIGNEE_NOT_ELIGIBLE`, `ASG_WORK_ITEM_TYPE_NOT_ASSIGNABLE`, `ASG_REASSIGN_NOT_ALLOWED`, `ASG_CLEAR_NOT_ALLOWED`.

## Permisos (v1)

| Acción | Quién |
|--------|--------|
| Leer asignación e historial (y asignables) | Coordinación, ejecutores (`scrum_developer`, …), `auditor`, `scrum_coach` (solo lectura operativa) |
| Asignar / reasignar / desasignar a terceros | `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner` |
| Autoasignar / desasignarse a sí | `scrum_developer` (no reasigna libremente a terceros) |
| `scrum_coach` | Sin rol de reasignación operativa por defecto (v1) |
| `auditor` | Solo lectura |

## Auditoría de workspace

Evento `work_item_assignment_changed` (IDs, sin nombres como fuente mínima): `workItem` identificado vía `resource` + `actorUserPublicId` + `previousValue` / `nextValue` con `assigneeUserPublicId` cuando aplica el repositorio de auditoría.

## Asignación huérfana

Si deja de cumplirse el universo (por ejemplo, sale del equipo) **no** se desasigna en background: la lectura sigue mostrando al asignado. Las **nuevas** mutaciones exigen un destino en el universo actual.

## Postergado

- Múltiples asignados, asignación a equipo, asignación masiva, heurísticas automáticas, métricas avanzadas, jobs de saneamiento de huérfanos, acoplamiento fuerte con impedimentos.

## Impedimentos

Solo compatibilidad futura (sugerir responsable en UI); sin escritura cruzada en v1.
