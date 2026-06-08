# project-scrum-sprint-board

Backend MVP del **sprint board Scrum**: inicio explícito del sprint (`ready_for_execution` → `active`), lectura del tablero y movimiento de ítems con **`boardColumn`** persistido en la **membresía sprint–ítem** (sin segunda fuente de verdad).

Alineado a `contracts-docs/docs/modules/project-scrum-sprint-board/`.

## Autorización

- **Lectura** (`GET …/board`): `assertCanReadSprintBoard` — incluye `scrum_developer`, `auditor`, `scrum_coach` además de operadores del sprint.
- **Mutación** (`start`, `move-board-column`): `assertCanMutateSprintBoard` — sin developer/auditor/coach.
- Review, retrospectiva y métricas reutilizan la misma familia lectura/mutación vía board.

## Rutas (`/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/:sprintPublicId/start` | Inicia el sprint (`active`). Inicializa `boardColumn` = `to_do` y sincroniza backlog a `open` para cada historia/tarea comprometida. |
| GET | `/:sprintPublicId/board` | Vista del board: sprint, columnas fijas, ítems con `boardColumn` y **`acceptanceCriteriaSummary`** (conteos; detalle en `project-scrum-backlog/WORK-ITEM-ACCEPTANCE-CRITERIA.md`). |
| POST | `/:sprintPublicId/items/:backlogItemPublicId/move-board-column` | Body `{ "boardColumn": "to_do" \| "in_progress" \| "in_review" \| "done" }`. Actualiza membresía y **sincroniza** `status` del backlog. |

Las rutas se montan con un **segundo** `app.use` en el **mismo** prefijo que `project-scrum-sprint-planning`.

## Modelo

- **`boardColumn`** en documento de membresía (`ProjectScrumSprintAssignment`). `null` antes de iniciar el sprint; tras `start`, historias/tareas quedan en `to_do`.
- **Mapeo backlog:** `to_do`→`open`, `in_progress`/`in_review`→`in_progress`, `done`→`done`.

## Permisos

- **Lectura** (`GET .../board`): admin, operator, agility_lead (misma franja que backlog/planning para ver).
- **Mutación** (`start`, `move-board-column`): admin, operator, agility_lead, **scrum_master**, **product_owner**.

Códigos de error: `sprint_board_forbidden`, `sprint_board_validation_error`, `sprint_board_not_found`.

## Decisiones conservadoras

1. **Transiciones entre columnas:** en MVP cualquier cambio entre las4 columnas está permitido; el servidor solo valida que la columna exista en el enum (sin grafo restrictivo).
2. **`GET /board`:** solo si el sprint está **`active`**; si está `ready`, error400 con mensaje explícito (iniciar primero).
3. **`startSprint`:** el estado del sprint pasa a `active` **al final**, después de inicializar columnas y backlog, para no dejar el sprint activo con board a medias si falla un ítem intermedio **[P]** transacciones multi-documento opcionales.
4. **Fricción:** ampliación de roles respecto al texto más corto de backlog/planning; los datos de workspace deben poder asignar `scrum_master` / `product_owner` para que esos actores muten el board.

## Fuera de alcance (fase actual)

Cierre de sprint, métricas, auditoría de eventos, subtareas movibles, WIP, columnas configurables.

### Criterios de aceptación en la respuesta del board

Cada ítem incluye `acceptanceCriteriaSummary` (`totalCriteriaCount`, `pendingCriteriaCount`, `doneCriteriaCount`, `reviewedCriteriaCount`). Sprint **cerrado**: los contadores reflejan el ítem **actual** en backlog, no el snapshot de cierre (TODO fase 2 si hace falta congelar).
