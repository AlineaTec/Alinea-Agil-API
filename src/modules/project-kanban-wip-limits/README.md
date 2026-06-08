# project-kanban-wip-limits (API)

## Propósito

Capacidad v1 para **límites WIP por columna** en proyectos Kanban: configuración (límite + política), evaluación coherente en **move** (no en **reorder**), override restringido bajo política `blocking`, y auditoría de cambios de configuración y de overrides.

## Qué es WIP en el producto (v1)

- **Por columna**: el límite cuenta ítems en esa columna del tablero (incluye ítems bloqueados).
- **Umbral `near` global del proyecto**: por defecto **0.8** del límite (no configurable por columna en v1).
- **Políticas**: `informational` (solo señal), `warning` (confirmación al **tocar o exceder** el límite al entrar un ítem), `blocking` (rechazo con **409** `wip_limit_blocked` salvo override autorizado con **razón**).

## Qué no es (v1)

- WIP por persona o por equipo.
- Reglas libres por columna más allá de límite + política + umbral global.
- Métricas agregadas de saturación o señales operativas avanzadas (el diseño de evaluación permite extender más adelante sin romper el contrato de columnas).
- Auditoría de cada intento fallido de move (solo eventos de configuración y de override aplicado).

## Defaults v1 (plantilla base)

Por **posición** de columna `0..3` (Ready → In Progress → Review → Done), alineado a `project-kanban-core`:

| Posición | Rol típico   | Límite | Política por defecto |
|---------|--------------|--------|----------------------|
| 0       | Ready / cola | sin    | informational        |
| 1       | In Progress  | 3      | blocking             |
| 2       | Review       | 1      | blocking             |
| 3       | Done         | sin    | informational        |

Los filas sin `wip_enforcement` en datos legacy

## Relación con board movement

- **Move** entre columnas (`board-column-item-movement` y `KanbanBoardService.moveItemToColumn`) evalúa WIP **antes** de DoR/DoD.
- **Reorder** dentro de la misma columna **no** evalúa WIP.
- Orden: permisos / estructura → **WIP** → **DoR/DoD**.

## Relación con DoR/DoD

Los controles de trabajo (`work-ready-done-controls`) se ejecutan **después** de la decisión WIP en `moveItemToColumn` y en `releaseItemToFlow` (misma familia de chequeos WIP en la columna de entrada).

## Roles y override (v1)

Capacidades lógicas: `kanban.wip.read`, `kanban.wip.manage`, `kanban.wip.override` (véase `project-kanban-permissions`).

- **Lectura**: misma frontera efectiva que lectura de tablero.
- **Gestión de configuración** y **override al mover** bajo `blocking`: `admin`, `operator`, `agility_lead`, `scrum_master`.
- No override: `product_owner`, `scrum_developer`, `scrum_coach`, `auditor`.

## API HTTP

- `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-wip` — snapshot WIP por columna.
- `PATCH /v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-wip` — actualiza `wip_near_threshold_ratio` y/o columnas (`limit`, `policy`).

En **move** / **release**, el cuerpo puede incluir:

- `kanban_wip_move_ack` (y/o `allow_wip_override` como compatibilidad) para política `warning`.
- `kanban_wip_override_reason` para política `blocking` cuando se excedería el límite.

## Limitaciones y pospuestos

- Métricas avanzadas (tiempo sobre WIP, columnas saturadas, etc.).
- WIP por persona/equipo.
- Workflow designer / BPM complejo / IA.
