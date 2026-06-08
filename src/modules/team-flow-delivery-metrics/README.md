# Módulo `team-flow-delivery-metrics`

API de **lectura** de **métricas de flujo y entrega** alineada a `contracts-docs/docs/modules/team-flow-delivery-metrics/`. Objetivo: visibilidad **operativa y analítica** sobre el **movimiento** del trabajo, tiempos proxy, **arrastre** (Scrum), **re-asignación** e **intención** de asignación — **no** desempeño individual, no RR.HH., no “equipo lento” como producto, no **score** opaco, no forecasting, no IA.

## Qué mide (v1) y qué no

| Incluido (v1) | No incluido (postergado) |
|---------------|--------------------------|
| `throughputLastPeriod` (done en ventana; ver notas) | Lead/cycle time sofisticados, percentiles |
| `carryOverRate` (Scrum, último sprint **cerrado** vía `SprintMetricsService`) | Materialized views, jobs de agregación (preparar en capa superior) |
| `oldActiveWorkItemsCount`, `unassignedWorkItemsCount`, `blockedWorkItemsInFlowCount` (snapshot) | `averageBlockedTime` acumulado (falta modelo temporal de bloqueo) |
| `averageTimeToFirstAssignmentDays` / `reassignmentEventCountInPeriod` (historial; capability) | Banda/health opaco, forecast |
| `hasSufficientData`, `dataQualityWarnings[]`, `calculationNotes[]`, señales de fricción (strings) | Evaluación de desempeño, ranking de personas |

## Postura v1: permisos (backend)

Mapeo lógico a **capabilities** (documentación `api-needs`):

| Capability (doc) | Comportamiento v1 en API |
|------------------|----------------------------|
| `flow-metrics.read` | Todos los miembros **activos** / `active_without_seat` pueden leer resumen de equipo. |
| `flow-metrics.assignment-quality.read` | **No** es un endpoint aparte: el mismo resumen pone a `null` `averageTimeToFirstAssignmentDays` y `reassignmentEventCountInPeriod` y añade `ASSIGNMENT_QUALITY_NOT_VISIBLE` si el rol **no** califica. **Sí** califican: `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_coach`. **No** califican: `auditor`, `scrum_developer`, y el resto sin esos roles. |
| `flow-metrics.cross-team.read` | `GET /metrics/flow/teams`: **no** `auditor` ni `scrum_developer`; sí admin/operator y los roles metodológicos de coordinación anteriores (misma tesis que métricas operativas v1 en producto). |

- **Cualquier miembro activo** puede `GET /teams/.../flow/summary` (misma línea de base que resumen operativo: lectura de agregado de equipo). Los campos de **asignación** (tiempo a 1.ª asignación, reasignaciones) solo se rellenan si el **rol** puede ver *assignment quality*; si no, van en `null` y `dataQualityWarnings` incluye `ASSIGNMENT_QUALITY_NOT_VISIBLE`.
- **Quién** puede ver *assignment quality*: `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_coach` (misma tesis que coordinar flujo, **no** developer).
- **Comparativa** `GET /metrics/flow/teams`: **no** `auditor` (v1), **no** `scrum_developer` — ver mensajes 403 en policy.
- **Auditor** **sí** puede el **resumen** de equipo, pero **no** señales de *assignment quality* (null + warning) y **no** lista cross-team.

**Limitación v1 (paginación + filtro `methodology`)** El `totalCount` de la respuesta refleja el conteo de equipos de la **consulta a repositorio** (status/archivado), no el número de filas tras filtrar en memoria por `methodology`. Conviene combinar con `methodology` solo cuando se acepta que una página pueda devolver **menos** ítems que `limit` (o documentar ajuste futuro en agregado).

## Scrum vs Kanban (honestidad)

- `methodologyContext` se deriva de los **proyectos** vinculados (Scrum, Kanban, `mixed`, etc.).
- `carryOverRate` **solo** tiene sentido con proyectos **Scrum**; en **Kanban puro** es `null` y `dataQualityWarning` `SCRUM_CARRY_NOT_APPLICABLE`.
- **Throughput** usa la **misma** noción de ítem (backlog compartido): `status === "done"` y `updatedAt` en el periodo. **No** se equipara “throughput de ventana” con “cierre de sprint” en una sola cifra sin leer `period` y notas.
- **Bloqueo**: en equipos con **solo** proyectos Scrum en backlog, `blockedWorkItemsInFlowCount` en Kanban *no* aplica a ítems puramente de backlog; se avisa con `BLOCKED_NOT_APPLICABLE` y notas.

## Definiciones operativas (v1)

- **Periodo por defecto**: `rolling_7d_utc` = últimos 7 días calendario hasta `now` (UTC), extremos inclusivos (ms) salvo ajuste futuro. Query opcional `from`+`to` (ambos o ninguno) para ventana custom.
- **throughputLastPeriod**: número de **non-epic** con `status === "done"` y `updatedAt` ∈ `[period.from, period.to]`. *Proxy* de fecha de cierre: **no** es `completedAt` dedicado → siempre se declara con `dataQualityWarnings: THROUGHPUT_USES_ITEM_UPDATED_AT_PROXY`.
- **carryOverRate**: 0–1, media de `notCompletedItemsCount / committedItemsCount` del **cierre** del **último sprint cerrado** por proyecto Scrum vinculado. Si no hay cierre, gaps en fuente, o `getBasicSprintMetrics` falla, hay `CARRY_OVER_SOURCE_GAPS` o ratio `null` según el caso.
- **oldActiveWorkItemsCount**: activos (open|in_progress, non-epic) con edad estricta \> `FLOW_AGING_STALE_DAYS` días (30) desde `createdAt`.
- **Bloqueo temporal** (`averageBlockedTimeDays`): **siempre** `null` en v1 (sin agregar cálculo engañoso).

## Fuentes reutilizadas

- `workspace-work-teams` (equipo, vínculos a proyecto)
- `workspace-project-runtime` (enfoque operativo)
- `project-scrum-backlog` (ítems, `assignmentHistory`, `isBlocked`, `updatedAt`)
- `project-scrum-sprint-planning` (listar sprints, último cerrado) + `SprintMetricsService` (cierre, carry)

## Estructura y evolución

- Cálculo **on demand**; el servicio se instancia con los mismos repositorios que el resto de la app. A futuro: capa de caché, snapshots, tablas/aggregates, sin romper DTOs.

## Endpoints

- `GET /v1/workspaces/:workspacePublicId/teams/:teamPublicId/flow/summary?projectPublicId&from&to`
- `GET /v1/workspaces/:workspacePublicId/metrics/flow/teams?projectPublicId&from&to&limit&offset&includeArchived&methodology=scrum|kanban`

Códigos: **403** (policy), **404** (equipo inexistente en workspace en summary).

## Trazabilidad

- `contracts-docs`: módulo `team-flow-delivery-metrics`
- Códigos de advertencia: alineación con `api-needs` §6 (prefijos/semántica).
