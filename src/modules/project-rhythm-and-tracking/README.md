# project-rhythm-and-tracking (API)

Superficie **resumida y orientada a UI** para la sección **«Ritmo y seguimiento»** en la home del proyecto operativo. **No** sustituye informes detallados, ni la home completa, ni las métricas vivas; **compone** lo ya calculado en otros módulos.

## Contrato de producto

- Documentación: `contracts-docs/docs/modules/project-rhythm-and-tracking/` (incl. `open-questions.md` OQ-01…15 cerradas v1).
- Relacionados: `project-scrum-burndown-velocity`, `project-scrum-sprint-metrics`, `project-cycle-lead-time`, `project-kanban-metrics`, `project-kanban-wip-limits`, `project-impediments`, `workspace-project-runtime`.

## Endpoint

`GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/rhythm-tracking`

- **Auth:** igual que el resto del workspace (Bearer + billing gate).
- **Policy:** unión de quien puede leer **tablero de sprint**, **métricas Kanban** o **runtime del proyecto** (`assertCanReadProjectRhythmTracking`), alineado a burndown/velocity y flow-time sin exigir solo `assertCanReadProjectRuntime` a perfiles developer.

## Composición (sin recalcular)

| Enfoque | Fuentes reutilizadas |
|--------|----------------------|
| **Scrum** | `ScrumBurndownVelocityService` (burndown + velocity), `ScrumSprintPlanningRepository` (sprint activo) |
| **Kanban** | `FlowTimeService` (lead/cycle), `KanbanMetricsService.getThroughput` (ventana acotada), `KanbanWipConfigService.getWip` (resumen textual WIP) |
| **predictive_phases** | Solo estado operativo + CTA; sin métricas inventadas |

## Visual principal por enfoque (v1)

| Enfoque | Principal | Notas |
|---------|-----------|--------|
| Scrum + sprint **activo** y burndown **con `hasSufficientData`** | `burndown` | Si burndown no es fiable → `committed_completed` |
| Scrum **sin** sprint activo | `committed_completed` | Datos desde últimos sprints cerrados con métricas v2 |
| Kanban | `lead_time` | Gráfico solo si `FlowTimeResponseDto.hasSufficientData` (≥ **5** ítems en ventana) |
| predictive_phases | `text_only` | Sin KPI de ritmo |

## Secundarias y señales

- **Velocity (Scrum):** bloque secundario siempre; `displayMode: chart` solo si hay **≥ 3** sprints cerrados con filas en la respuesta de velocity; si no, texto/degradado honesto (`flags.insufficientSprintHistory`).
- **Cycle time / throughput (Kanban):** secundarias; throughput con ventana fija **14 días** en copy y payload; si la auditoría no permite serie fiable → `flags.throughputUnavailable` y bloque degradado (OQ-06, OQ-07).
- **WIP:** solo **`signals.wip`** (conteos/columnas en riesgo), sin serie tipo mini-chart.
- **Impedimentos:** **`signals.impediments`** (conteos por severidad y estado activo); Scrum con sprint activo pasa `relatedSprintPublicId` al listado **si** existe sprint en foco (OQ-09). Si el usuario no puede leer impedimentos, el bloque puede ser `null` sin fallar el GET.
- **Aging:** **`flags.agingNotAvailableInV1: true`** en Kanban; no se expone aging como visual.

## Última actividad

`lastActivity` es **best-effort**: `operational_project_updated_at` desde el runtime persistido (OQ-13). No define una métrica nueva de negocio.

## Errores HTTP

| Código | `error` | Uso |
|--------|---------|-----|
| 404 | `project_rhythm_tracking_not_found` | Proyecto operativo inexistente o mismatch |
| 403 | `project_rhythm_tracking_forbidden` | Sin permiso de lectura según policy |
| 400 | `invalid_params` | UUIDs inválidos |

Las carencias parciales de métricas se devuelven en **200** con `flags`, `dataQualityWarnings` y `displayMode` degradado.

## Pospuesto (v1.1+)

- Aging en esta superficie, forecasting, ventanas configurables, gráficos redundantes, IA.

## Tests

`npm test` incluye `project-rhythm-tracking.service.test.ts` (Scrum/Kanban/predictive, umbrales, throughput, policy).
