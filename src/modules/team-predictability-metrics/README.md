# Módulo `team-predictability-metrics`

API de **lectura** de **métricas de predictibilidad de equipos** alineada a `contracts-docs/docs/modules/team-predictability-metrics/`.

## Propósito

Poner en el workspace una lectura **honesta y metodológicamente explícita** de **consistencia, estabilidad y confiabilidad de entrega** por equipo, **sin** tratarlo como:

- forecasting sofisticado, Monte Carlo, probabilidades de negocio, ni IA
- un **score** único u opaco
- evaluación de **personas** o “equipo bueno / malo”
- mezclar **Scrum** y **Kanban** como si fueran la misma magnitud (velocity ≠ throughput de ítems)

## Métricas v1 soportadas

- **Resumen por equipo** (`/predictability/summary`): núcleo Scrum (velocidad media, varianza, commitment completion, carry-over) y/o núcleo Kanban (throughput semanal, varianza), `methodologyContext`, `period` / `lastN` / `periodsUsedCount`, `readiness`, `hasSufficientData`, bloque de **variación** (CoV + regla de rango), `dataQualityWarnings`, `calculationNotes`
- **Tendencia** (`/predictability/trend`): puntos por sprint (Scrum) o semana (Kanban) con señalización de calidad básica
- **Comparativa workspace** (`/metrics/predictability/teams`): lista de resúmenes con advertencia de metodología mixta a nivel workspace cuando aplica

## Cálculo de `readiness`

- `< 3` periodos comparables (según eje usado) → `insufficient`
- `3–5` → `limited`
- `6+` → `adequate`

`hasSufficientData` está alineado con **lectura razonable**: `true` solo cuando `readiness === adequate` (6+ periodos en la regla documentada).

## Alta variación v1

En `VariationBlock`: **coeficiente de variación** σ/μ y **razón de rango** (max−min)/max(μ, ε), con umbralers documentados. Señal `high` / `moderate` / `low` / `indeterminate`; **indeterminate** con historia corta o μ≈0.

## Scrum vs Kanban

- No se mezclan en un único número: contexto `scrum` / `kanban` / `mixed` y, en `mixed`, `variation` consolidada = `null` (interpretar `scrum` y `kanban` por separado)
- En comparativas con equipos de ambos enfoques, el backend devuelve **warnings** de comparabilidad (sin ranking agresivo)

## Honestidad sobre datos

- Códigos en `dataQualityWarnings` (p. ej. pocos periodos, mezcla de metodologías, multi-proyecto Scrum, agregación multi-proyecto Kanban, métricas de sprint no disponibles v2, etc.)
- `calculationNotes` con recordatorios de límites on-demand y definiciones

## Postergado (v1+)

- Snapshots, caché, preagregación, materialized views, jobs, percentiles móviles complejos, forecasting, IA, score global

## Endpoints (bajo `GET /v1/workspaces/:workspacePublicId`)

| Ruta | Policy |
|------|--------|
| `/teams/:teamPublicId/predictability/summary` | Cualquier miembro activo (incl. `auditor`, `scrum_developer`) |
| `/teams/:teamPublicId/predictability/trend` | `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_coach` (no `auditor`, no `scrum_developer`) |
| `/metrics/predictability/teams` | Igual que trend |

Filtros de consulta soportados: `projectPublicId`, `lastN` (defecto **6**), y en listado `includeArchived`, `methodology=scrum|kanban`, `limit`, `offset`.
