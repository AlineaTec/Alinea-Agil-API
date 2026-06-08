# project-scrum-burndown-velocity (API)

Módulo **sólo backend** que expone:

- **Burndown** (trabajo **restante** en **story points** frente a días **calendario** del sprint, más línea **ideal** lineal v1).
- **Velocity** (story points **completados** por **sprint cerrado**, por defecto los últimos **6**; **misma** semántica que `project-scrum-sprint-metrics` vía `SprintMetricsService.getBasicSprintMetrics`).

Implementación alineada a `contracts-docs/docs/modules/project-scrum-burndown-velocity/`.

## Qué **es**

| Concepto   | v1 (API) |
|------------|----------|
| **Burndown** | Serie diaria (UTC) de `remainingPoints` + `idealRemainingPoints` (línea ideal simple entre baseline de puntos y 0 en el último día). |
| **Velocity**   | Por sprint **cerrado**: `completedStoryPoints` + opcional promedio simple sobre N sprints. |

## Qué **no** es

- No forecasting, Monte Carlo, IA, ni agregación cross-team.
- No selector de unidad (sólo `story_points`).
- No “done paralelo” para el gráfico: **done = columna `done` del board** (y cierre) coherente con el resto del producto; los controles DoD/WM se aplican al **mover** ítems (no re-evaluados aquí).

## Fuentes de verdad

- **Mismo `storyPoints` / snapshot v2** que cierre y métricas: burndown **cerrado** exige cierre con snapshot **Sprint Metrics v2** (puntos congelados + AC), igual que el endpoint de métricas básicas.
- **Movimientos de columna** y **cambio de story points** se leen de **`workspace-audit-log`** (categorías `scrum_sprint_board_item`, `scrum_backlog_item`) en la ventana del sprint.
- Si **no** hay eventos de tablero en auditoría: en **cierre** se aplican posiciones `finalBoardColumn` del snapshot a la **hora de cierre** (serie plana *hasta* el cierre; nota en `calculationNotes`).
- **Sprint activo:** el **último día** (si calendario = hoy) se **reconcilia** con membresía + backlog (tablero en vivo) para no divergir del estado real.

## Honestidad (`hasSufficientData`, notas, warnings)

- `hasSufficientData` en burndown es **falso** si no hay **baseline** de puntos estimados, o si **no** hubo eventos de tablero y **no** se usó cierre sintético (p. ej. sprint activo sin movimientos auditados: la curva no es fiable; ver `dataQualityWarnings` y `calculationNotes`).
- `calculationVersion` fija: constante de dominio `BURNDOWN_VELOCITY_CALCULATION_VERSION` (`"1"`).

## Endpoints

| Método | Ruta (montaje) | Query |
|--------|----------------|-------|
| `GET` | `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints/:sprintPublicId/burndown` | `includeIdealLine` (default true: `1`, `true`…; `false` para desactivar ideal) |
| `GET` | `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-metrics/velocity` | `lastN` (1–12, default **6**) |

## Política de lectura

Misma que tablero / métricas básicas: `assertCanReadSprintBoard` re-exportada como `assertCanReadScrumBurndownVelocity` (incl. `auditor` en la familia actual del backend).

## Postergado (evolución)

- Preagregación diaria, caché, materialización de series.
- Selector de unidad / ventana de UI más rica.
- Banda o segunda ideal por cambio de alcance.
- Días laborables en el eje X.
