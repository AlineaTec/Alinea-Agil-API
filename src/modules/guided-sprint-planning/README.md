# Guided Sprint Planning (`guided-sprint-planning`)

Backend v1 para **Sprint Planning Guiada**: facilitar sesiones de planificación del sprint y dejar trazabilidad de objetivo, capacidad, buffer, candidatos, decisiones, compromiso y línea base.

Contrato funcional: `contracts-docs/docs/modules/guided-sprint-planning/`.

## Propósito

- **Decide compromiso**, no solo selección mecánica de tickets.
- Modelo **híbrido**: PO (objetivo, prioridad), equipo (capacidad, factibilidad, riesgos), facilitador (cierre, baseline).
- **Capacidad y buffer** a nivel equipo; no ranking individual.
- **Compromiso operativo al sprint** se aplica **atómicamente al cierre** (OQ-GPLAN-12).
- **Baseline** al cierre cuando hay objetivo final o ≥1 ítem comprometido (OQ-GPLAN-4).

## Diferencia con otros módulos

| Módulo | Rol |
|--------|-----|
| **Guided Refinement** | Prepara ítems; no compromete al sprint. |
| **Daily Alignment** | Sincroniza el día; no fija compromiso del sprint. |
| **Sprint Planning operativo** (`project-scrum-sprint-planning`) | CRUD de sprint y memberships; este módulo documenta el **evento de planning**. |

## Adaptación por enfoque

| Enfoque | Comportamiento v1 |
|---------|-------------------|
| **Scrum** | Sesión ligada a `sprintPublicId` (una principal por sprint). |
| **Kanban** | Degradada a `flow_commitment_window` (fecha/slot, sin sprint). |
| **Predictive** | No operable (`guidedSprintPlanningOperable: false`). |

## Rutas HTTP

Base: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/guided-sprint-planning`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/current` | Bootstrap + sesión del sprint/ventana |
| POST | `/current/session` | Crear/actualizar cabecera (lazy) |
| GET | `/current/candidate-items` | Listar candidatos |
| POST | `/current/candidate-items/sync` | Sync desde refinamiento/backlog |
| GET/POST | `/current/candidate-items/:workItemPublicId` | Decisión por ítem |
| POST | `/current/close` | Cierre + baseline + apply commitment |
| POST | `/current/additive-note` | Nota post-cierre |
| GET | `/recent` | Historial reciente |
| GET | `/sprints/:sprintPublicId/baseline` | Baseline del sprint |

Query común en `/current/*`: `sprintPublicId?`, `sessionDate?`, `sessionSlot?`.

## Permisos

- **Lectura**: `assertCanReadProjectRuntime`
- **Decisiones por ítem / cabecera**: `assertCanReadScrumBacklog` (PO, developers, etc.)
- **Cierre / nota aditiva**: SM, agility lead, PO, admin, operator


## Fuera de v1

- Forecast / IA
- Planning async pleno
- Reapertura de sesión
- Replanificación mid-sprint
- Informe PDF agregado
- Múltiples sesiones por sprint
- Enforcement rígido global de DoR
