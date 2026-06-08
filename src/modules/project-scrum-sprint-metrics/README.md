# project-scrum-sprint-metrics

Slice de **solo lectura** para el resumen de un sprint Scrum **cerrado**, alineado a `contracts-docs` (`docs/modules/project-scrum-sprint-metrics/`). Incluye el núcleo por **conteos de ítems** y la evolución **Sprint Metrics v2** (story points y señales de criterios **congeladas en el snapshot**).

## Rol

- **No** muta el cierre ni el snapshot.
- **Deriva** agregados desde `closure.items` y metadatos del sprint persistidos por **project-scrum-sprint-closure** y **project-scrum-sprint-planning**.
- **No** lee el ítem vivo del backlog para métricas v2: puntos y conteos de criterios deben existir en cada fila del snapshot (`storyPointsAtClosure`, `acceptanceCriteria*Count`).
- **No** persiste un summary en colección aparte.

## HTTP

`GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints/:sprintPublicId/metrics`

Respuesta JSON incluye:

- Núcleo: `committedItemsCount`, `completedItemsCount`, `notCompletedItemsCount`, `completionPercentage`, `finalBoardDistribution`, `goalAchieved`, `goalAtClosure`, `closedAt`, `plannedDurationDays` (opcional), `status`.
- **v2:** `metricsSchemaVersion: 2`, `committedStoryPoints`, `completedStoryPoints`, `notCompletedStoryPoints`, `completionPercentageByStoryPoints` (`null` si no hay puntos comprometidos — **no** se envía `0` engañoso), `estimatedCommittedItemsCount`, `unestimatedCommittedItemsCount`, `itemsWithPendingAcceptanceCriteriaCount`, `itemsWithNotFullyReviewedAcceptanceCriteriaCount`, `carryoverItemsCount`, `carryoverStoryPoints` (suma congelada en ítems `not_completed` con puntos).

Historias y tareas se **mezclan** en un solo agregado de puntos (sin desglose por tipo en esta fase).

## Elegibilidad v2 y cierres legacy

- Si el sprint está `closed` pero el snapshot **no** incluye campos congelados (cierre anterior al despliegue de v2), el endpoint responde **400** con mensaje explícito: no se inventan métricas v2.
- Snapshot inconsistente (p. ej. criterios cuyo total no cuadra con pending+done+reviewed, o `completed` sin columna `done`) → **400**.

## Permisos (MVP)

Se reutiliza **`assertCanReadSprintBoard`**: admin, operator, agility_lead, scrum_master, product_owner.

## Reglas de derivación v2 (resumen)

| Concepto | Regla |
|----------|--------|
| Puntos comprometidos | Suma de `storyPointsAtClosure` donde no es `null` |
| Puntos completados / no completados | Suma en ítems `completed` / `not_completed` con puntos |
| % por puntos | Solo si `committedStoryPoints > 0`; si no, `null` |
| Estimado / no estimado | `storyPointsAtClosure != null` vs `null` |
| Criterios pendientes (ítems) | Ítems con `acceptanceCriteriaPendingCount > 0` |
| Criterios no plenamente revisados (ítems) | `total > 0` y `reviewed < total` |
| Carryover | `outcome === "not_completed"`; puntos = suma de `storyPointsAtClosure` en ese subconjunto |

## Fuera de alcance

Velocity multi-sprint, burnup/burndown, CFD, forecasting, dashboards ejecutivos, Kanban.
