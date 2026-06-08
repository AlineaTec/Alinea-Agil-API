# project-kanban-backlog (API)

Backlog Kanban **plano** v1: lista separada del board, misma colección de ítems que Scrum (`ScrumBacklogItem`) con **`kanbanColumnPublicId`** como verdad única backlog vs flujo (`null` = backlog; id de columna = en flujo).

## Contrato de datos

- Listado backlog: `kanbanColumnPublicId === null` y `parentItemPublicId === null` (sin jerarquía en v1).
- Orden: `sortOrder` ascendente entre ítems de backlog.
- Creación: entra siempre al backlog (`kanbanColumnPublicId: null`).
- Liberar: asigna `kanbanColumnPublicId = entryColumnPublicId` del `ProjectKanbanFlowConfig` (validado contra columnas persistidas).
- WIP columna de entrada: si `wipLimit` no es `null` y el conteo actual ≥ límite, `POST .../release-to-flow` responde **409** con `requires_wip_override: true` salvo `allow_wip_override: true` en el cuerpo.
- Retorno al backlog: `kanbanColumnPublicId: null`, `parentItemPublicId: null`, `sortOrder` por debajo del mínimo actual (inserta arriba).

## HTTP

Base: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-backlog`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/items?q=` | Lista backlog + búsqueda texto en título/descripción |
| POST | `/items` | Crea ítem en backlog |
| GET | `/items/:backlogItemPublicId` | Detalle (solo si sigue en backlog) |
| PATCH | `/items/:backlogItemPublicId` | Edita ítem en backlog |
| POST | `/items/reorder` | Cuerpo `{ orderedBacklogItemPublicIds }` (permutación exacta del backlog) |
| POST | `/items/:id/release-to-flow` | Cuerpo opcional `{ allow_wip_override?: boolean }` |
| POST | `/items/:id/return-to-backlog` | Saca del flujo al backlog |

También se montan **asignación** y **comentarios** bajo el mismo prefijo (`/items/:id/assignment`, `/items/:id/comments`), reutilizando servicios transversales con `requireScrumOrKanbanWorkspaceRuntimeProject`.

## Permisos (v1, producto)

Capa canónica: **`project-kanban-permissions`** (`kanbanMemberHas*` + catálogo `KANBAN_CAPABILITY`). Este slice expone `assertCan*` en `kanban-backlog-authorization.policy.ts` (delegación).

- **`kanban.backlog.read`**: amplia (incl. `scrum_developer`, `auditor`, `scrum_coach`).
- **`kanban.backlog.edit`**: coordinación + `scrum_developer`; no `auditor` / `scrum_coach`.
- **`kanban.backlog.rank`**, **`kanban.release_to_flow`**: `admin`, `operator`, `agility_lead`, `product_owner`, `scrum_master`.
- **Retorno al backlog**: capacidad **`kanban.board.return_to_backlog`** (política en `project-kanban-board`, misma frontera efectiva que liberar).

## Auditoría

Eventos en `workspace_audit_events`: categoría `kanban_backlog_item`, acciones `released_to_flow` y `returned_to_backlog` (`previousValue` / `nextValue` con snapshot mínimo).

## Tipos de ítem

- Crear: `epic`, `user_story`, `task`, `bug` (sin `subtask` en este slice).
- Liberar al flujo: `bug`, `task`, `user_story` únicamente.

## Postergado

Filtros avanzados, permisos por membresía de proyecto más fina que workspace.
