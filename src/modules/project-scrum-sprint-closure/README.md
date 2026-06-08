# project-scrum-sprint-closure

Cierre explícito de sprint Scrum (MVP backend), alineado con contracts-docs.

## Decisión de modelo

El **snapshot histórico** se persiste como **subdocumento `closure` en el documento del sprint** (`ScrumSprint`), no en una colección aparte. Motivos:

- Un sprint cerrado es 1:1 con su cierre; no hace falta otra clave ni joins.
- La lectura histórica del tablero reutiliza `GET .../board`: si el sprint está `closed`, las filas salen de `closure.items` (inmutables) en lugar de membresías vivas.

## HTTP

- `POST .../scrum-sprints/:sprintPublicId/close`  
  Body: `closureNote` (obligatorio, no vacío), `goalAchieved` (boolean), `confirmIncompleteWork` (opcional; **obligatorio `true`** si queda trabajo no terminado en el board).

Idempotencia: si el sprint ya está `closed`, responde **200** con el mismo sprint (incluye `closure`), sin 409.

Lectura del tablero cerrado: `GET .../scrum-sprints/:sprintPublicId/board` (misma ruta que sprint-board; permisos de lectura del board).

## Efectos en datos

- Sprint: `status: closed`, `closure` con auditoría (`closedAt`, `closedByUserPublicId`, nota, `goalAchieved`, `sprintGoalAtClosure`, ítems del snapshot).
- Cada fila del snapshot incluye datos **congelados** para métricas históricas (Sprint Metrics v2), sin depender del ítem vivo después del cierre:
  - `storyPointsAtClosure`: `number | null` (null si no había estimación).
  - `acceptanceCriteriaTotalCount`, `acceptanceCriteriaPendingCount`, `acceptanceCriteriaDoneCount`, `acceptanceCriteriaReviewedCount`: resumen numérico al instante del cierre (sin persistir el texto de cada criterio).
- Membresías del sprint: se **eliminan** al cerrar para liberar el compromiso activo; el histórico queda en `closure.items`.
- Ítem en columna **done**: se setea `completedInSprintPublicId` al `sprintPublicId` cerrado.
- Ítem no terminado: se conservan `status` y `sortOrder` del backlog; sin tocar `completedInSprintPublicId`.

## TODO acotado (fuera de MVP)

- Evento de dominio `sprint.closed` (no hay bus de eventos en la API hoy).
- Migración automática de snapshots antiguos sin campos congelados (hoy: esos sprints no son elegibles para métricas v2 hasta re-cierre imposible → ver nota en **project-scrum-sprint-metrics**).
- Velocity, burndown.

## Fricción conocida

- Concurrencia: el cierre y el movimiento de tarjeta no usan transacción única; el último `replace` del sprint o `updateMembership` gana a nivel de persistencia. Tras `closed`, `move-board-column` falla por estado no `active`.
