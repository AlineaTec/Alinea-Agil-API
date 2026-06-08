# `project-operating-snapshot` (API)

Capa **agregada de lectura** para el **Hub del proyecto** y el motor de **Next Best Action (NBA)**.

Contrato funcional: `contracts-docs/docs/modules/project-operating-snapshot/`.

## Qué es

Un endpoint que compone en una sola respuesta:

- etapa wizard (`configure` … `improve`)
- ciclo focal (sprint / ventana Kanban / fase predictiva)
- estado resumido de rituales
- alertas priorizadas
- NBA principal (+ snooze)
- señales mínimas para el hub

## Qué no reemplaza

- Backlog, tablero, planning guiada, daily, review, retro, informes PDF
- No muta dominio operativo (read-only salvo snooze NBA)

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/operating-snapshot` | Snapshot agregado |
| `PUT` | `.../operating-snapshot/nba-snooze` | Persistir “omitir por hoy” |

Query GET opcional: `forceRefresh`, `includeCalendarExtract`.

## Resolución v1

- **Ciclo focal Scrum:** `active` → más reciente `planning`/`ready_for_execution` → `closed` (14d reciente / stale)
- **Kanban:** inferencia desde sesión planning/commitment (sin entidad `kanban_window`)
- **Etapa:** señales objetivas; `execute` gana sobre review pendiente de sprint anterior
- **Ready for planning count:** última revisión refinement con `reviewed` + `readyForPlanning`
- **Daily pending:** alerta medium desde 14:00 TZ operativa, laborables

## Persistencia (runtime)

`createOperatingSnapshotService(projectRuntime, runtimePersistence)` lee dominios fuente desde `runtimePersistence` (scrum, guided sessions, impediments). Ver `composition/operating-snapshot-runtime-sources.ts` y `docs/POSTGRESQL-RUNTIME-SWITCH.md`.

NBA snooze: `NBA snooze: tabla `project_operating_snapshot_nba_snoozes`. Repo desde `runtimePersistence.operatingConsumers.nbaSnooze`.

## Caché

TTL **30s** in-memory por `(workspace, project, user)`. Header `Cache-Control: private, max-age=30`.

Limitación: no invalidación event-driven; usar `forceRefresh=true` tras mutaciones relevantes.

## Postergado v1

- Calendario full / roadmap integrado
- `rhythmSummary` (métricas)
- Feature flag workspace
- Entidad `kanban_window`
- Analytics pre-launch
