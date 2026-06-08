# Refinamiento Guiado (`guided-refinement`)

Backend v1 alineado a `contracts-docs/docs/modules/guided-refinement/*`.

## Propósito y límites

- **Prepara** el backlog y deja **trazabilidad** de sesiones de refinamiento; **no** compromete trabajo al sprint ni sustituye **Sprint Planning**.
- **No** es minuta genérica ni checklist obligatorio universal.
- **No** hay scoring de calidad, IA de resumen ni follow-ups automáticos como work items (v1).

## Modelo híbrido

| Rol | En v1 (API) |
|-----|----------------|
| **PO / negocio** | Puede participar en revisión (`assertCanReadScrumBacklog`); **puede cerrar** sesión igual que SM (OQ-GRF-6). |
| **Developers / equipo** | `POST` revisión de ítem si leen backlog Scrum/Kanban. |
| **Facilitador** | Cierra sesión (`POST .../close`), notas aditivas tras cierre; `closeSummary`, acuerdos, follow-ups. |

## Semántica `reviewed` vs `readyForPlanning`

- **`reviewStatus = reviewed`:** el ítem fue tratado en la sesión.
- **`readyForPlanning`:** además, sin ambigüedad material para el siguiente compromiso — solo válido si `reviewStatus === reviewed` (validación en servicio).
- **`consensus_pending` en `notReadyReasons`:** fuerza `readyForPlanning = false` (OQ-GRF-5).

## Enfoque operativo

| `operationalApproach` | Comportamiento |
|------------------------|----------------|
| `scrum` | Soporte completo; `readyNomenclature` orientada a planning; sprint opcional en cabecera. |
| `kanban` | Mismo modelo; `readyNomenclature` = siguiente compromiso; sprint no requerido. |
| `predictive_phases` | `GET /today` y lecturas devuelven `supportLevel: unsupported` / sin sesión; `recent` vacío; mutaciones → **409** `guided_refinement_unsupported`. |

## TZ y fecha

- `sessionDate` es **YYYY-MM-DD** en calendario **IANA** `WORKSPACE_OPERATIONAL_TIME_ZONE` o **UTC** (misma filosofía que `daily-alignment`).
- Clave única: `(workspacePublicId, projectPublicId, sessionDate, sessionSlot)` con `sessionSlot` default `default`.

## Sesión

- Creación **lazy** en primera revisión de ítem o `POST /today/session`.
- Estados: `open` | `closed` | `closed_without_decisions` (sin ítems `reviewed` al cerrar).
- **No reapertura;** `POST /today/additive-note` agrega texto tras cierre.
- **Contadores en respuesta HTTP** (sin ambigüedad):
  - `reviewedItemCount`: filas con `reviewStatus === reviewed`.
  - `readyForPlanningCount`: ítems con `readyForPlanning === true`.
  - `pendingCandidateReviewCount`: candidatos en `candidateWorkItemPublicIds` que aún no tienen `reviewStatus === reviewed` (si no hay lista de candidatos, es **0**).
  - `reviewedNotReadyCount`: revisiones con `reviewStatus === reviewed` y `readyForPlanning === false`.
- Registros legacy anteriores pueden haber guardado solo el campo legado `pendingReviewCount`; al leer se migra de forma conservadora a `reviewedNotReadyCount` hasta el próximo recálculo.

## Readiness

- `readinessSignals[]` en respuestas de revisión: **orientativas**, `isGuidanceOnly` salvo ack de listo; **nunca** bloquean guardado en v1.

## API HTTP

Prefijo:

`/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-refinement`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/today` | Bootstrap: `supportLevel`, TZ, `sessionDate`, `session`, `readyNomenclature` |
| POST | `/today/session` | Lazy + cabecera: foco, candidatos, modo live/async, roles opcionales |
| GET | `/today/reviewed-items` | Lista revisiones del día + señales |
| GET | `/today/reviewed-items/:workItemPublicId` | Detalle + señales |
| POST | `/today/reviewed-items/:workItemPublicId` | Upsert revisión (lazy sesión) |
| POST | `/today/close` | Cierre facilitador / PO |
| POST | `/today/additive-note` | Nota tras cierre |
| GET | `/recent?limit=` | Historial reciente |
| GET | `/work-items/:workItemPublicId/latest-review` | Última revisión operativa (OQ-GRF-9) + `supportLevel`, `guidedRefinementOperable`, TZ |

La respuesta de **`GET .../latest-review`** incluye siempre:

- `supportLevel`: `full` | `flow_refinement` | `unsupported` (misma semántica que `GET /today`).
- `operationalApproach`, `operationalTimeZone`.
- `guidedRefinementOperable`: `false` en `predictive_phases`; la revisión devuelta puede ser **histórica** (p. ej. cambio de enfoque) y entonces `readinessSignals` irá vacío.
- `review`: última revisión por `sessionDate` / `updatedAt`, o `null`.

Query opcional: `sessionDate`, `sessionSlot` (misma convención que daily-alignment).

## Persistencia

- `guided_refinement_sessions`
- `guided_refinement_reviewed_items`

## Auditoría

Categoría `guided_refinement_session`: creación lazy, cabecera, revisión, cierre, nota aditiva.

## Postergado (no v1)

- Scoring, IA fuerte, dependencias estructuradas obligatorias, follow-ups → work items automáticos, enforcement rígido DoR, notificaciones al cerrar.
