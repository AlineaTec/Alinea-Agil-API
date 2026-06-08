# project-kanban-board (API)

Superficie del trabajo **ya en flujo** (`kanbanColumnPublicId != null`). Alineado a **project-kanban-core** (columnas + WIP) y **project-kanban-backlog** (retorno al backlog, mismos roles que liberar).

## Snapshot (`GET .../kanban-board/snapshot`)

- Columnas del flujo persistido (nombre, posición, `wipLimit`, `policyText`).
- Tarjetas agrupadas por columna, ordenadas por `sortOrder` y `createdAt`.
- Solo ítems con columna asignada (nada de “Backlog” en el tablero).

### Tarjeta (DTO compacto)

Por tarjeta se devuelve al menos:

| Campo | Notas |
|--------|--------|
| `backlogItemPublicId` | id estable del ítem |
| `itemType` | incl. `bug` |
| `title` | |
| `columnPublicId` | columna actual (verdad de estado en flujo) |
| `isBlocked`, `blockedReason` | bloqueo explícito v1 |
| `assignment` | `assignedUserPublicId`, `assignmentUpdatedAt` |
| `priorityLevel` | |
| `storyPoints` | |
| `acceptanceCriteriaSummary` | conteos por estado (mismo helper que backlog) |
| `commentsCount` | |

No se incluye `description` ni lista completa de criterios para mantener el snapshot acotado; el detalle sigue en PATCH de backlog u otras rutas.

## Operaciones

Políticas: **`project-kanban-permissions`** + `kanban-board-authorization.policy.ts`.

| Ruta | Capability (v1) |
|------|-----------------|
| `GET /snapshot` | `kanban.board.read` |
| `POST /items/:id/move` | `kanban.board.move` |
| `POST /items/:id/block`, `/unblock`, `PATCH .../blocked-reason` | `kanban.board.block` (misma matriz efectiva que move) |
| `POST /items/:id/return-to-backlog` | `kanban.board.return_to_backlog` (delegado en `KanbanBacklogService.returnItemToBacklog`; evento `returned_to_backlog`). |

## WIP al mover

Si la columna destino tiene `wipLimit` y ya está llena, respuesta **409** `kanban_move_wip_exceeded` con `requires_wip_override`, análogo a liberar en backlog. Reintento con `allow_wip_override: true` en el cuerpo de `move`.

## Bloqueo

- `isBlocked` / `blockedReason` viven en el documento del ítem (compartido con Scrum en la misma colección; Scrum los deja en `false` / `null`).
- Al **retornar al backlog** desde el board (vía servicio de backlog) se limpian bloqueo y razón.

## Auditoría (`kanban_board_item`)

- `moved_between_columns`
- `blocked` (incl. actualización de razón vía `PATCH .../blocked-reason`, con `previousValue`/`nextValue` de la razón)
- `unblocked`

## Postergado

Filtros de tablero, swimlanes, métricas, permisos por capability (`project-kanban-permissions`).
