# project-cycle-lead-time (API)

Lead time y **cycle time** de flujo **Kanban** a nivel de proyecto, **on-demand** sobre el log de auditoría (mismos eventos que `project-kanban-metrics`: `released_to_flow`, `returned_to_backlog`, `moved_between_columns`).

Especificación de producto: `contracts-docs/docs/modules/project-cycle-lead-time/`.

## Qué mide (v1)

- **Lead time:** días (reloj) desde la **primera entrada al flujo** (columna de entrada = `flow_entry` / `entryColumnPublicId` en config) hasta el **cierre** en la **columna terminal** (Done / `resolveTerminalColumnPublicId` en código compartido con métricas Kanban).
- **Cycle time:** desde la **primera entrada a la primera columna de trabajo** entre entrada y terminal (**execution start**: primera columna con posición estrictamente entre Ready y Done en el flujo ordenado) hasta el **mismo** cierre. Si no hay esa columna o traza, `cycleTime` = `null` y se informa con warnings.

**No** es tiempo registrado a mano (time log), **no** es forecast, **no** es “desde `createdAt`”.

## Qué no es este módulo

- Percentiles, cohortes, comparativas cross-team, IA, mezcla Scrum/Kanban bajo el mismo contrato, ni agregación por **equipo** (solo **proyecto**).

## Fuente de verdad (backend)

- **Inicio de flujo y movimientos:** `WorkspaceAuditLogRepository` (categorías `kanban_backlog_item`, `kanban_board_item`).
- **Columnas y terminal:** `KanbanFlowService` / `project-kanban-core` + `resolveTerminalColumnPublicId` (`project-kanban-metrics/services/kanban-flow-terminal.ts`).
- **Cierre (done):** transición a la columna terminal; misma lógica operativa que el board (eventos de movimiento hacia `toColumnPublicId` = terminal).

## Regla de “última finalización” (v1)

- **Agregado:** entran los ítems cuya **última** finalización a terminal en el replay cae en `[from, to)`.
- **Detalle (opcional):** **una** fila por ítem, la carrera asociada a esa finalización. No se exponen múltiples “runs” por ítem en v1.

## Ventana y zona horaria

- `from` **inclusivo**, `to` **exclusivo** (`[from, to)`).
- Sin parámetros: **12 semanas** rolling hacia `now` (en ms).
- `timeZone` en el payload: mientras el workspace no persista IANA, se devuelve **`UTC`**; las notas de cálculo lo indican. Fechas `YYYY-MM-DD` se interpretan en **UTC** a medianoche (comportamiento documentado; evolución: zona del workspace en un solo sitio).

## Proyecto Scrum

Si `operationalApproach !== "kanban"`, se responde **422** con `error: "scrum_not_supported"` (no 200 con ceros).

## Permisos

- **`kanban.flow_time.read`:** alineada a `kanban.metrics.read` (misma matriz efectiva).
- **`kanban.flow_time.detail.read`:** títulos en detalle; en v1, **auditor** no recibe títulos (`title: null`, `detailTitlesRedacted: true`) aunque pida `includeItemDetails`.

## HTTP

- `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics/flow-time`
- Query: `from`, `to` (opcionales), `timeZone` (opcional, metadata), `includeItemDetails=true|false` (defecto false).

## Postergado (diseño preparado, no requerido ahora)

- Snapshots, materialización, caché/ETag, percentiles, correlación con time log, IANA del workspace en persistencia.
