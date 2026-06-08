# project-kanban-metrics (Kanban v1)

Métricas de **flujo** (no sprint): snapshot de WIP por columna, bloqueados, throughput semanal hacia la columna terminal, aging e indicador conservador de lead time.

## Permisos

Capacidad **`kanban.metrics.read`**: la política HTTP es `assertCanReadKanbanMetrics` en este slice, delegando en **`project-kanban-permissions`** (`kanbanMemberHasMetricsRead`). Matriz efectiva: `admin`, `operator`, `auditor`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_developer`, `scrum_coach`.

## HTTP

Base: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban-metrics`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/snapshot` | Columnas con `wipLimit` y `currentItemCount`, `blockedItemsCount`, `itemsInFlowCount`, `terminalColumnPublicId`. |
| GET | `/throughput` | Serie semanal (lunes UTC) de ítems movidos a la columna terminal; query opcional `from`, `to` (ISO o `YYYY-MM-DD`). Ventana por defecto: 12 semanas hasta “ahora”. Incluye `leadTimeFromFlowEntry` si hay auditoría. |
| GET | `/aging` | Ranking `topOldest` y agregados `byColumn` (tiempo en columna actual; segmento en flujo desde último `released_to_flow` visible en el log). |

## Fuente de datos (auditoría)

Registros en `workspace_audit_events` vía `WorkspaceAuditLogRepository.listForProject` (orden ascendente por `occurredAt`).

| Métrica | Categoría | Acción | Uso |
|---------|-----------|--------|-----|
| Throughput (completados) | `kanban_board_item` | `moved_between_columns` | Cuenta eventos cuyo `nextValue.toColumnPublicId` es la columna **terminal** (nombre `Done`, case-insensitive, o columna con mayor `position`). |
| Lead time (segmento flujo → terminal) | `kanban_backlog_item` | `released_to_flow` | Inicio del intervalo por ítem. |
| Lead time (fin) | `kanban_board_item` | `moved_between_columns` | Fin al llegar a la columna terminal (mismo criterio que throughput). |
| Reinicio de segmento | `kanban_backlog_item` | `returned_to_backlog` | Anula el “en flujo” hasta un nuevo release. |
| Aging (columna actual) | `kanban_backlog_item` + `kanban_board_item` | `released_to_flow`, `moved_between_columns`, `returned_to_backlog` | Replay para última entrada a la columna actual; si el replay no coincide con el estado persistido, se usa `updatedAt` del ítem (`source: fallback_updated_at`). |
| Aging (días en segmento) | `kanban_backlog_item` | `released_to_flow` (+ `returned_to_backlog`) | Ultimo release antes de `now` en el lookback del log; si no hay evento en la ventana, se aproxima con `updatedAt`. |

**Límites:** el log se consulta con un lookback fijo (~450 días). Ítems cuyo historial relevante es anterior quedan sesgados. **Cycle time** por etapas y **CFD** quedan fuera de v1.

## Lead time

Se expone como mediana de días (fracción decimal) entre `released_to_flow` y el movimiento a terminal, solo para completados cuya fecha de terminal cae en el rango solicitado. Si no hay muestras, `medianDays` es `null` y las notas lo indican.

## Tests

`npm test` incluye `kanban-metrics.service.test.ts` y `kanban-metrics-authorization.policy.test.ts`.
