# work-ready-done-controls (API v1)

## Propósito

Módulo backend para **Definition of Ready (DoR)** y **Definition of Done (DoD)** como **controles metodológicos** evaluables por evento, con niveles `informational` / `warning` / `blocking`, override restringido y auditoría mínima.

## Qué es / qué no es

- **Es:** reglas evaluables sobre `work items` en eventos concretos; configuración por **proyecto**; plantilla de **workspace** sin herencia viva; token de override de un solo uso para desbloquear transiciones bloqueadas por criterios `blocking`.
- **No es:** motor de reglas genérico ilimitado, BPM, ni checklist decorativa sin efecto en transiciones (las transiciones relevantes llaman al servicio antes de persistir).

## Fuente de verdad

- **Proyecto:** el perfil persistido en `work_controls_project_profiles` es la fuente de verdad v1.
- **Workspace:** `work_controls_workspace_templates` es **plantilla**; se aplica al proyecto con `POST .../apply-workspace-template`; cambios posteriores en la plantilla **no** arrastran a proyectos existentes.

## Catálogo v1 (evaluador)

**DoR:** `dor_title_present`, `dor_description_present`, `dor_acceptance_criteria_present`, `dor_priority_defined`, `dor_story_points_if_scrum`, `dor_no_open_critical_impediment`, `dor_assignee_present` (por defecto **warning**; falta de asignatario no bloquea el agregado salvo que se suba a `blocking` en config).

**DoD:** `dod_acceptance_criteria_satisfied`, `dod_no_open_critical_impediment`, `dod_not_blocked`, `dod_status_ready_for_done` (Scrum: advertencia si no está `in_progress` al cerrar; Kanban: n/a en columna vía mapping).

**Postergado explícitamente:** subtareas obligatorias pendientes; cualquier criterio sin chequeo estable en el dominio actual.

## Eventos y rutas

Códigos: `ready_add_to_sprint`, `ready_start_execution`, `done_close_item`.

- **Proyecto:** `GET|PATCH /v1/workspaces/:ws/projects/:p/work-controls`, `GET .../evaluation/:workItemPublicId?eventCode=...`, `POST .../override`, `POST .../apply-workspace-template`
- **Plantilla:** `GET|PATCH /v1/workspaces/:ws/work-controls-template`

**Override:** el cliente emite un token con `POST .../override` (razón obligatoria) y reenvía `X-Work-Controls-Override-Id` en la transición real (sprint, PATCH backlog, movimiento Kanban, etc.).

## Integración (transiciones)

- Scrum: `ready_add_to_sprint` al comprometer ítem al sprint; `ready_start_execution` al pasar a `in_progress`; `done_close_item` al pasar a `done` (misma verdad de dominio que el estado persistido del ítem).
- Kanban: `done_close_item` y `ready_start_execution` al mover a columnas cuyo `publicId` coincide con el **mapeo explícito** del perfil; `ready_start_execution` al liberar a flujo **solo** si la columna de entrada del flujo coincide con `startExecutionColumnPublicId` (configurado).

## Política v1 (resumen)

- Lectura/evaluación: miembros activos con rol de producto/Scrum/ops según `work-ready-done-controls-authorization.policy.ts` (p. ej. `scrum_developer` lee y evalúa, sin gestionar ni override).
- Override: `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner` — excluidos `scrum_developer`, `scrum_coach`, `auditor` (v1).

## Qué queda postergado

- Tasas agregadas de bypass; reglas avanzadas y dependencias amplias de otros módulos; configuración distinta por equipo; motor genérico de reglas; bloqueo de cierre de sprint por DoD (explícitamente fuera v1 a nivel de producto — no se integró en `sprint-closure`).

## Auditoría

Colección `work_controls_audit_events`: eventos de perfil, plantilla, `transition_blocked`, emisión y consumo de override (payload mínimo: IDs, códigos, snippet de razón en emisión acotado).
