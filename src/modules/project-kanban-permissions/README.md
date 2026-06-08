# project-kanban-permissions (Kanban v1)

Capa explícita **capabilities × rol** para Kanban en `api`, alineada a `contracts-docs/docs/modules/project-kanban-permissions/`. No introduce roles nuevos: reutiliza `workspace-roles` de forma pragmática y documenta la **deuda conceptual** (nombres `scrum_*` en proyectos solo Kanban).

## Capacidades v1

| Capability | Significado breve |
|------------|-------------------|
| `kanban.backlog.read` | Lista y detalle backlog Kanban. |
| `kanban.backlog.edit` | Crear/editar ítems en backlog (sin implicar liberar). |
| `kanban.backlog.rank` | Reordenar backlog. |
| `kanban.release_to_flow` | Liberar a columna de entrada. |
| `kanban.board.read` | Ver tablero. |
| `kanban.board.move` | Mover entre columnas. |
| `kanban.board.return_to_backlog` | Retorno al backlog (misma frontera que liberar, PKP-05). |
| `kanban.board.block` | Bloquear / desbloquear / razón (v1: misma matriz efectiva que move). |
| `kanban.flow.configure` | Columnas, WIP, `policyText`, `entryColumnId` (mutación futura). |
| `kanban.events.read` | Timeline / log de flujo cuando exista API dedicada. |
| `kanban.metrics.read` | Métricas de flujo. |
| `kanban.flow_time.read` | Lead & cycle: **misma** matriz que `kanban.metrics.read` (agregado). |
| `kanban.flow_time.detail.read` | Detalle con títulos; **auditor** excluido (v1). |
| `kanban.reports.read` | Reportes agregados (**concepto separado**; v1 misma política efectiva que métricas). |

## API pública

- **Evaluación pura:** `kanbanMemberHas*` y `kanbanMemberHasCapability(actor, KANBAN_CAPABILITY.*)` en `policies/kanban-member-capabilities.policy.ts`.
- **Asserts HTTP / servicio por slice:** siguen viviendo en `project-kanban-backlog`, `project-kanban-board`, `project-kanban-metrics`, `project-cycle-lead-time`, delegando en las funciones anteriores.
- **Preparados sin slice de reportes aún:** `assertCanReadKanbanReports`, `KanbanReportsForbiddenError`.
- **Flujo:** `assertCanConfigureKanbanFlow` — v1 **solo** `admin` y `operator`; ampliar PO/SM/AL es [P] en contracts (no concedido aquí).

## Mapeo efectivo a roles (v1)

Resumen; detalle en código y en `acceptance-criteria.md` del contrato.

- **Lectura amplia** (backlog, board, metrics, reports, events): incluye `auditor`, `scrum_coach` donde la matriz lo indica (coach lee backlog/board; no edita backlog ni prioriza).
- **Edición backlog:** coordinación + `scrum_developer` (opción [P] en contrato; ya permitida en api).
- **Rank / release / return:** `agility_lead`, `product_owner`, `scrum_master` + admin/operator — **sin** `scrum_developer`.
- **Board move y block:** coordinación + **`scrum_developer`**; sin auditor ni coach.
- **Flow configure:** **solo** `admin` | `operator**.

## Integración en slices

| Slice | Uso |
|-------|-----|
| `project-kanban-backlog` | `assertCanReadKanbanBacklog`, `assertCanMutateKanbanBacklogContent`, `assertCanRankKanbanBacklog`, `assertCanReleaseToFlow`; retorno usa `assertCanReturnKanbanBoardItemsToBacklog` (board). |
| `project-kanban-board` | `assertCanReadKanbanBoard`, `assertCanMoveKanbanBoardItem`, `assertCanBlockKanbanBoardItems`, `assertCanReturnKanbanBoardItemsToBacklog`. |
| `project-kanban-metrics` | `assertCanReadKanbanMetrics`. |
| `project-kanban-core` | Lectura de flujo sigue `assertCanReadProjectRuntime` (sin cambio de producto); mutación de flujo futura debe usar `assertCanConfigureKanbanFlow`. |

## Deuda conceptual

- Los identificadores de rol son **Scrum-centric**; en proyecto **solo Kanban** la intención es “coordinación”, “ejecutor”, “observador”, no el significado literal de Scrum.
- **`kanban.flow.configure`** restringido a admin/operator puede ampliarse por producto [P]; documentar cualquier cambio aquí y en contracts.
- **`reports.read`** debe poder divergir de **`metrics.read`** en el futuro sin romper nombres.

## Postergado

- Endpoints OpenAPI / claims JWT por capability.
- RBAC por fila o por proyecto distinto del workspace.
- `kanban.events.read` en rutas dedicadas.

## Tests

`npm test` incluye `kanban-member-capabilities.policy.test.ts`.
