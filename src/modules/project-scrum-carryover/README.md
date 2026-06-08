# project-scrum-carryover (backend MVP)

Slice de **visibilidad y trazabilidad mínima** de ítems Scrum que quedaron **no completados** al cerrar un sprint, alineado con `contracts-docs/docs/modules/project-scrum-carryover/`.

## Fuente de verdad

- Solo sprints con `status === "closed"` y subdocumento `closure` **coherente** (`closedAt` válido, `items` es arreglo).
- Dentro del snapshot: filas con `outcome === "not_completed"` y `backlogItemPublicId` no vacío.
- **No** se clona el ítem: sigue el mismo `backlogItemPublicId` en product backlog.
- **No** se infiere carryover solo por `status` del ítem en backlog.

## Derivación en lectura

Los campos JSON (`isCarryover`, `lastNotCompletedSprintPublicId`, etc.) se calculan al servir respuestas; **no** hay flag persistido `isCarryover` en el work item en esta fase.

Si en el futuro el costo de escanear cierres + membresías por request resulta alto, se puede **materializar** o **indexar** (por ejemplo snapshot al cerrar o campo derivado actualizado en eventos de cierre/re-compromiso). Este MVP prioriza simplicidad y coherencia con el snapshot de cierre.

## Reglas MVP

- **Última referencia:** si el ítem aparece como `not_completed` en varios sprints cerrados, se expone el cierre con **`closure.closedAt` más reciente**.
- **`isCarryover`:** `true` solo si existe esa referencia **y** el ítem **no** tiene membresía en un sprint en `planning` | `ready_for_execution` | `active` (misma noción que bloquea otro compromiso en planning).
- Si el snapshot es incompleto o inconsistente, **no** se inventa carryover: se devuelven valores “vacíos” (`isCarryover: false`, referencias `null`).
- **Histórico multi-sprint** completo y conteos acumulados (`carryoverCount`) quedan fuera del MVP.

## Superficies HTTP

Los campos se añaden a respuestas existentes de:

- `project-scrum-backlog`: listado, detalle, crear, mover y patch de ítems (mismo shape en el `item`).
- `project-scrum-sprint-planning`: `GET .../scrum-sprints/:sprintPublicId/items` en el objeto embebido `backlogItem`.

No hay endpoint dedicado solo a carryover en esta fase.

## Fricción / rendimiento (MVP)

Por ítem se consulta `listMembershipRowsForBacklogItemInProject` para saber si sigue comprometido en un sprint abierto. En un `GET` de backlog grande esto implica **1 lectura de todos los sprints del proyecto** más **una consulta de membresías por ítem**. Si esto escala mal, la evolución natural es materializar carryover al cerrar el sprint, mantener un índice por proyecto, o una consulta por lotes que devuelva membresías activas por lote.

## TODO acotado (evolución)

- Filtros y vistas solo carryover en API.
- Conteo acumulado / histórico en una sola respuesta.
- Automatización de replanificación o recomendaciones.
- Integración UX más rica en `web` (badges, etc.).
