# project-scrum-sprint-review

Sprint Review como **artefacto cualitativo** ligado a un **sprint Scrum cerrado**. Persistencia: subdocumento **`review`** en el mismo registro del sprint (jsonb), **hermano** de `closure` (no dentro del snapshot inmutable de cierre).

Especificación: `contracts-docs/docs/modules/project-scrum-sprint-review/`.

## Rutas

Montaje: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/:sprintPublicId/review` | `200` con `{ review: null }` si no hay review; `{ review: { ... } }` si existe. |
| `POST` | `/:sprintPublicId/review` | Crea la review (solo sprint `closed`). |
| `PATCH` | `/:sprintPublicId/review` | Actualiza campos parciales (solo si ya existe review). |

- **404** solo si el sprint (o contexto de proyecto/workspace) no existe; **nunca** solo porque la review aún no exista (`GET` devuelve `review: null`).
- **409** `sprint_review_already_exists` si se intenta **POST** cuando ya hay review (usar `PATCH`).
- **400** si el sprint no está `closed`, validación de cuerpo, o `PATCH` sin review previa.

## Permisos (MVP)

- **Lectura:** `assertCanReadSprintBoard` (admin, operator, agility_lead, scrum_master, product_owner).
- **POST/PATCH:** `assertCanMutateSprintBoard` (misma familia que cierre y tablero).

## Modelo persistido

Ver `project-scrum-sprint-planning/domain/sprint-review.ts` y subdocumento en `persistence/schemas/scrum-sprint.schema.ts`.

## Decisiones conservadoras

- Sin colección separada; unicidad 1:1 garantizada en dominio (un solo subdocumento por sprint).
- `POST` exige al menos un campo de texto no vacío tras `trim` (body no totalmente vacío).
- `PATCH` exige al menos una clave en el JSON; los campos omitidos no cambian.
- `GET`/`POST`/`PATCH` requieren sprint **`closed`** para alinear con métricas y contrato documental del artefacto “post-cierre”.

## TODO acotado

- Borrado de review, versionado, asistentes, aprobación PO: fuera de alcance.
