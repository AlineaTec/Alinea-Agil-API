# workspace-project-runtime

Proyecto **operativo materializado**: contenedor persistido separado del **project draft** (`workspace-projects`). Solo existe tras materialización exitosa del wizard; `not_ready_complete` no crea fila aquí.

## Alcance actual

- Modelo mínimo + tabla PostgreSQL `WorkspaceRuntimeProject`
- `ProjectRuntimeService.getProjectRuntimeSummary` — valida existencia, workspace y permisos
- `GET /v1/workspaces/:workspacePublicId/projects` — listado de proyectos operativos (`{ projects: [...] }`, items sin `initialConfigurationSummary`)
- `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/summary`
- `ProjectDraftService.materializeDraft` crea el runtime vía `createWorkspaceRuntimeProjectFromMaterialization` y usa el mismo `projectPublicId` (UUID v4) en el draft

## Consistencia / transacciones

- Se intenta **transacción Prisma** (`runWithTransactionPreferred`) para insert del runtime + `replace` del draft en un solo paso (típico en Atlas / replica set).
- En **entornos sin transacciones disponibles

## Naming

| Concepto | Módulo / campo |
|----------|----------------|
| Borrador | `workspace-projects`, `draftPublicId` |
| Proyecto operativo | este módulo, `projectPublicId` (debe coincidir con `draft.materializedProjectPublicId` cuando se enlace la materialización) |

## Materialización

`materializeDraft` genera `projectPublicId = randomUUID()`, persiste `WorkspaceRuntimeProject` y actualiza el draft en la misma transacción cuando el servidor lo permite. Índice único `(workspacePublicId, sourceDraftPublicId)` + reconciliación evitan doble proyecto ante reintentos o carreras.

**Riesgo / datos legacy:** borradores ya `materialized` con `prj_stub_…` **no** tienen fila en esta colección; el summary seguirá en 404 hasta remigrar o volver a materializar en un entorno limpio.

## Autorización (lectura)

**Listado** (`GET .../projects`) y **resumen** (`GET .../summary`): **admin**, **operator**, **auditor**; y miembros activos con rol metodológico **agility_lead**, **scrum_coach**, **scrum_master**, **product_owner** o **scrum_developer** (misma familia que lectura de tablero sprint en `project-scrum-sprint-board`).

**Alcance del listado:** **admin**, **operator**, **auditor** y **agility_lead** ven todos los proyectos operativos del workspace. **scrum_coach**, **scrum_master**, **product_owner** y **scrum_developer** solo ven proyectos enlazados a al menos un equipo (`work_team_project_links`) en el que tienen membresía activa (`work_team_memberships`). Para esos roles, un `GET .../summary` sobre otro proyecto responde **404** (misma forma que proyecto inexistente). Las comparativas cross-team de métricas de equipos (operativo, flow, predictabilidad) usan el mismo criterio de membresía; el detalle por `teamPublicId` devuelve **404** si el actor no pertenece al equipo.

Mutación de runtime: no expuesta en estas rutas; la materialización sigue vía flujo de drafts con otras políticas.

## `initialConfigurationSummary`

Objeto discriminado por `kind` (`scrum` | `kanban` | `predictive_phases`) con flags booleanos para submódulos futuros. Tras crear, suelen estar en `false` hasta implementar backlog/board/fases.
