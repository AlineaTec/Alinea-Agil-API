# project-scrum-sprint-retrospective

Sprint Retrospective como artefacto de **mejora de proceso y equipo** ligado a un **sprint Scrum cerrado**. Persistencia: subdocumento **`retrospective`** en el registro del sprint (jsonb), **hermano** de `closure` y `review` (no dentro del snapshot de cierre).

Especificación: `contracts-docs/docs/modules/project-scrum-sprint-retrospective/`.

## Contenido

- **Retrospectiva:** `wentWell`, `didNotGoWell`, `improvements`, **`actionItems[]`** (lista estructurada).
- Cada elemento de **`actionItems`**: `actionItemPublicId`, `text`, `ownerUserPublicId` (nullable), `status` (`open` | `done`), `createdAt`, `updatedAt`.
- **No** es work item del backlog; **no** usa `work-item-assignment`.

## `actionItems` estructurado (MVP evolucionado)

- Antes del cambio, `actionItems` era **un solo string** en persistencia.
- Ahora es un **arreglo embebido** en el subdocumento retrospectiva, alineado al contrato documental.
- **POST** y **PATCH** del recurso `/retrospective` aceptan `actionItems` como arreglo en JSON.
- **PATCH:** si el cuerpo incluye `actionItems`, la lista del servidor se **reemplaza** por la recibida tras validación. Si una fila trae `actionItemPublicId` que ya existía en la retrospectiva, se **conserva `createdAt`** de ese ítem (preservación mínima); filas sin id coincidente reciben **nuevo** `actionItemPublicId` y marcas de tiempo nuevas.
- **No** hay sub-rutas por acción, recordatorios, promoción a backlog ni workflow automático.

## Lectura

## Rutas (montadas bajo scrum-sprints)

| Método | Ruta | Notas |
|--------|------|--------|
| `GET` | `/:sprintPublicId/retrospective` | `200` `{ retrospective: null }` o objeto con `actionItems[]`. |
| `POST` | `/:sprintPublicId/retrospective` | Crea (solo sprint `closed`). |
| `PATCH` | `/:sprintPublicId/retrospective` | Actualiza; ver reglas de `actionItems` arriba. |

- **409** `sprint_retrospective_already_exists` en segundo **POST** (paridad con review).
- Sprint no cerrado / validación: **400** con mensaje claro.

## Código relacionado

- Dominio: `project-scrum-sprint-planning/domain/sprint-retrospective.ts`
- Subdocumento: `project-scrum-sprint-planning/persistence/schemas/scrum-sprint.schema.ts`
- Mapper / legacy: `project-scrum-sprint-planning/persistence/mappers/scrum-sprint.mapper.ts`

## TODOs (evolución)

- Merge más rico por `actionItemPublicId` (conflictos concurrentes, ETag).
- Sub-rutas `.../retrospective/action-items/:id` si el PATCH monolítico escala mal.
- Promoción a ítem de backlog y vínculo explícito.
- Integración opcional con asignación de work items (modelo distinto del owner actual).
- Estados adicionales, fechas objetivo, responsable obligatorio por política.

## Fricciones

- **Sprint Review** sigue siendo artefacto paralelo; el copy en cliente debe separar “acciones de mejora” (retrospectiva) de “próximos pasos” de producto (review).
- **`ownerUserPublicId`** es referencia opcional; no implica el mismo comportamiento que **work-item-assignment** en ítems de backlog.
