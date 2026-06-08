# PostgreSQL — dominio Scrum/Kanban operativo (Fase 4)

Esquema y repositorios Prisma de sprints, planning guiado y flujo Kanban. **PostgreSQL es la persistencia activa** del runtime HTTP.

## Tablas en PostgreSQL

| Tabla Postgres | Nombre legacy (migración) | Rol |
|----------------|-----------------|-----|
| `sprints` | `project_scrum_sprints` | Ciclo operativo Scrum |
| `sprint_assignments` | `project_scrum_sprint_assignments` | Vínculo sprint ↔ `work_items` (solo enlace) |
| `guided_sprint_planning_sessions` | `guided_sprint_planning_sessions` | Ritual/operación de planning guiado |
| `guided_sprint_planning_candidate_items` | `guided_sprint_planning_candidate_items` | Decisiones por ítem en sesión |
| `guided_sprint_planning_baselines` | `guided_sprint_planning_baselines` | Artefacto de cierre (no copia del sprint) |
| `kanban_flow_configs` | `project_kanban_flow_configs` | Configuración de columnas/WIP por proyecto |

Migración: `prisma/migrations/20250608120000_scrum_kanban_domain/`

### Naming: baselines

Se usa **`guided_sprint_planning_baselines`** (no `planning_baselines` genérico) porque en el repo la colección activa y el dominio son explícitamente de *guided sprint planning*; evita colisión con futuros artefactos de planning distintos.

### Separación de conceptos

- **Sprint**: fechas, goal, status; `closure` / `review` / `retrospective` en `jsonb` (subdocumentos JSON embebidos (jsonb), no tablas aparte en esta fase).
- **Assignment**: solo FK sprint + work_item + orden en tablero.
- **Session**: ritual guiado; índices parciales únicos (sprint-bound vs flow window) en SQL.
- **Baseline**: snapshot liviano de compromiso (IDs de ítems + metadatos), no duplica el agregado sprint.

### Reutilización de `work_items`

`guided_sprint_planning_candidate_items` y `sprint_assignments` referencian `work_items.id` por FK. No hay tabla de backlog paralela.

## Repositorios Prisma (no conectados al HTTP)

| Repositorio | Ubicación |
|-------------|-----------|
| `ScrumSprintPlanningPrismaRepository` | `project-scrum-sprint-planning/persistence/prisma/` |
| `GuidedSprintPlanningSessionPrismaRepository` | `guided-sprint-planning/persistence/prisma/` |
| `GuidedSprintPlanningCandidateItemPrismaRepository` | `guided-sprint-planning/persistence/prisma/` |
| `GuidedSprintPlanningBaselinePrismaRepository` | `guided-sprint-planning/persistence/prisma/` |
| `KanbanFlowPrismaRepository` | `project-kanban-core/persistence/prisma/` |

Helpers: `resolveSprintId`, `resolveGuidedPlanningSessionId` en `src/infrastructure/postgres/project-scope.ts`.

## Tests

```bash
cd api
npm run test:postgres:scrum-kanban
npm run test:postgres    # incluye Fase 4
```

Archivo: `src/test/postgres/scrum-kanban-domain.integration.test.ts`

## Fuera de alcance (esta fase)

Daily, refinement, review, retrospective como *guided sessions* separadas, impediments, billing, audit, snapshot/NBA.
