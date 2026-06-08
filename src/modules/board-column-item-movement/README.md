# board-column-item-movement (API)

Fachada **HTTP unificada** para **mover** y **reordenar** ítems en el tablero según el enfoque del proyecto (Scrum / Kanban), alineada a `contracts-docs/docs/modules/board-column-item-movement/`.

## Rutas (v1)

Montaje:  
`/v1/workspaces/:workspacePublicId/projects/:projectPublicId/board`

| Método | Ruta | Comando |
|--------|------|---------|
| `POST` | `/items/:workItemPublicId/move` | Cambio de columna (puede cruzar frontera operativa) |
| `POST` | `/items/:workItemPublicId/reorder` | Mismo `column_public_id` / `board_column`; solo orden relativo |

**Header opcional (DoR/DoD):** `X-Work-Controls-Override-Id` (mismo patrón que `work-ready-done-controls` y `kanban-board`).

## Move vs reorder

- **move**: puede cambiar columna, `status` de backlog (Scrum) y/o disparar `ready_start_execution` / `done_close_item` vía `WorkReadyDoneControlsService` (sin duplicar reglas en este módulo).
- **reorder**: no dispara work controls; no cambia `status` ni columna; solo `sprintSortOrder` (sprint) o `sortOrder` (Kanban) dentro de la columna.

## Semántica de columnas

- **Scrum:** `from_column_public_id` / `to_column_public_id` y `column_public_id` en reorder son **identificadores estables** (`to_do`, `in_progress`, `in_review`, `done`), no etiquetas de UI.
- **Kanban:** identificadores son **UUID** de columna del flujo persistido; mapeo DoR/DoD a columnas vive en `work-ready-done-controls` (perfil Kanban), igual que en `project-kanban-board`.

## Integración

- **Scrum move:** `SprintBoardService.moveBoardItem` ahora aplica `assertMayTransitionScrumToInProgress` / `assertMayCloseScrumItemToDone` y auditoría `scrum_sprint_board_item` (cuando procede).
- **Kanban move/reorder:** delega en `KanbanBoardService` (move ya tenía work controls; reorder nuevo).
- **Rutas legadas** (`scrum-sprints/.../move-board-column`, `kanban-board/.../move`) **siguen** expuestas; el slice unificado es la superficie adicional bajo `.../board`.

## Permisos (v1)

Misma amplitud efectiva que `kanban.board.move`: `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_developer`. `auditor` y `scrum_coach` no mutan. **Override** de controles: política existente en `work-ready-done-controls` (no duplicar).

## Limitaciones v1 / pospuesto

- Sin movimientos masivos, sin diseñador de workflow, sin reglas arbitrarias por columna, sin IA/BPM.
- `outcome: no_op` en **move** cuando origen = destino; en **reorder** se devuelve tablero/ítem aunque el orden no cambie (reconciliación fina = postergable).

## Tests

- `board-column-item-movement-authorization.policy.test.ts`
- `board-column-item-movement.service.test.ts`
