# project-impediments

Capacidad **Gestión de impedimentos** en el API: entidad de primera clase bajo proyecto operativo (Scrum o Kanban), alineada a `contracts-docs/docs/modules/project-impediments/`.

## Qué es un impedimento (v1)

- Condición que **frena o retrasa** el avance y merece **seguimiento explícito** (responsable, severidad, cierre documentado).
- **No** es: comentario, tarea, bug, riesgo formal, dependencia corporativa, ni ticket ITSM.
- **No** se acopla a `isBlocked` del Kanban en datos (eso es UX aparte).

## Qué no es (exclusiones v1)

- Comentarios/hilo propio del impedimento.
- Listado workspace-wide (solo por proyecto).
- Notificaciones por asignación / aging.
- Reporting de sprint integrado.
- Relación N:N con varios work items (como mucho **un** `relatedWorkItemPublicId`).
- Rol lógico como responsable: el responsable es **siempre** un `userPublicId` del workspace.

## Estados

| Estado        | Uso breve                          |
|---------------|------------------------------------|
| `open`        | Recién creado / pendiente acción   |
| `in_review`   | Triage / análisis                  |
| `mitigating`  | Acción activa                      |
| `resolved`    | Cerrado con resolución             |
| `dismissed`   | Cerrado como no aplica / duplicado |

Cierre con **`POST .../resolve`** o **`POST .../dismiss`**. Transiciones entre estados **activos** vía **`PATCH`** (sin cerrar). **`POST .../reopen`** desde `resolved` o `dismissed` → `open`.

## Severidad

`low` | `medium` | `high` | `critical`

## Campos de cierre

- **`resolved`** → `resolutionSummary` obligatorio; `resolvedAt` fijado; `dismissedAt` y `dismissalReason` nulos.
- **`dismissed`** → `dismissalReason` obligatorio; `dismissedAt` fijado; `resolvedAt` y `resolutionSummary` nulos.

## Endpoints

Base: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/impediments`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Lista con filtros (`status`, `severity`, vínculos, `limit`/`offset`). |
| `POST` | `/` | Crear (`status` inicial = `open`). |
| `GET` | `/:impedimentPublicId` | Detalle. |
| `PATCH` | `/:impedimentPublicId` | Campos editables (no cierre; impedimento cerrado debe reabrirse antes). |
| `POST` | `/:impedimentPublicId/resolve` | Body `{ resolutionSummary }`. |
| `POST` | `/:impedimentPublicId/dismiss` | Body `{ dismissalReason }`. |
| `POST` | `/:impedimentPublicId/reopen` | Body `{}` (vacío). |

**Filtro `status` en listado:** varios valores separados por comas (p. ej. `open,mitigating`).

## Permisos (aproximación conservadora)

Intento de reflejar capacidades documentadas (`impediments.read`, `impediments.update`, etc.) sin catálogo nuevo en BD:

| Operación | Regla |
|-----------|--------|
| **Lectura** | Quien pueda leer **backlog Scrum** **o** **sprint board** **o** **tablero Kanban** (incl. auditor / coach en lectura). |
| **Mutación** | `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_developer`. **No** `auditor` ni `scrum_coach`. |

No se infieren permisos solo por “tener backlog”; la unión de familias de lectura evita bloquear a quien entra solo por board Kanban o sprint.

## Auditoría

Colección **`project_impediment_audit_events`** (PostgreSQL), separada del `workspace_audit_events` centrado en ítems de backlog, pero con el mismo espíritu: `action`, `payloadBefore`, `payloadAfter`, actor, fecha.

Eventos: creación, actualización genérica, cambio de estado / severidad / responsable / `detectedAt`, resolución, descarte, reapertura.

## Integración

- Proyecto operativo: `ProjectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject`.
- Work item: `ScrumBacklogRepository.findByProjectAndItemId` (nombre API: `relatedWorkItemPublicId`).
- Sprint: `ScrumSprintPlanningRepository.findSprintByPublicId` (solo si el proyecto es **Scrum**).
- Miembros: `WorkspaceUserService.findActorMember` para validar responsable.

## Postergado (producto)

Ver tabla en `contracts-docs/.../open-questions.md` (N:N, workspace-wide, comentarios, notificaciones, reporting, retención fina).
