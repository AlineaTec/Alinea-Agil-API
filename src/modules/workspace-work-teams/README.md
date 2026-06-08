# Módulo `workspace-work-teams` (equipos de trabajo)

**Slug documental:** `workspace-work-teams` · **Recurso API:** `/teams` bajo el workspace (y listado bajo el proyecto, ver abajo).

## Propósito

Gestionar **equipos de trabajo** como entidad operativa anclada a un workspace: nombre, descripción, estado, tamaño objetivo opcional, líder, **membresías** (activas e históricas) y **vínculos a proyectos** (N:N). Alineado a `contracts-docs` (v1, decisiones ya cerradas).

**No** es estructura de RR.HH., no define permisos de seguridad del workspace, no sustituye roles metodológicos.

## Qué es / qué no es

- **Es** contexto operativo y visibilidad (quién con quién en qué proyectos).
- **No** es: `teamType`, `relationshipType: primary` en vínculo proyecto, `teamPublicId` en work items, ni capacidad/throughput avanzada.

## Estados (v1)

- `active`
- `inactive`
- `archived`

`targetSize` es opcional (entero 1..10000) y ligero.

## Campos de dominio (resumen)

- **Team:** `teamPublicId`, `workspacePublicId`, `name`, `nameNormalized` (interno, unicidad), `description?`, `status`, `teamLeadUserPublicId?`, `targetSize?`, timestamps.
- **Membership:** `teamMembershipPublicId` nuevo en cada reingreso tras baja; `isActive` / `leftAt` para historial. Baja de usuario del workspace no purga historial.
- **Team ↔ project:** enlace lógico; al retirar el vínculo se borra la fila; no hay `primary` en v1.
- **Auditoría:** colección `work_team_audit_events` con `payloadBefore` / `payloadAfter` (JSON) en operaciones relevantes.

## Endpoints (v1)

| Método | Ruta |
|--------|------|
| GET | `/v1/workspaces/:workspacePublicId/teams` |
| POST | `/v1/workspaces/:workspacePublicId/teams` |
| GET | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId` |
| PATCH | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId` |
| GET | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/members?includeInactive=true\|false` |
| POST | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/members` |
| DELETE | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/members/:userPublicId` (cuerpo opcional al **retirar al líder**) |
| GET | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/projects` |
| POST | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/projects` |
| DELETE | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/projects/:projectPublicId` |
| GET | `/v1/workspaces/:workspacePublicId/teams/:teamPublicId/audit` (solo roles con `teams.audit.read`) |
| GET | `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/teams` |

**Nota de montaje:** el `GET` por proyecto se registra en `app.ts` *antes* del runtime de proyectos, para no colisionar con `.../summary`.

**Listado de equipos:** query opcional: `status`, `teamLeadUserPublicId`, `memberUserPublicId`, `q` (búsqueda en nombre), `limit`, `offset`.

## Reglas v1 reseñables

- Nombre **único** en el workspace (comparación **case-insensitive** vía `nameNormalized`).
- El **líder** (si hay) es siempre **miembro activo**; si se asigna y no lo era, se inserta miembro en el mismo flujo.
- Quitar al líder con `DELETE .../members/:userPublicId` exige cuerpo: `{ "resolveLead": "clear" }` o `{ "resolveLead": "reassign", "newLeadUserPublicId": "<uuid>" }` (y el nuevo líder ha de ser ya miembro activo).
- Proyectos vinculados en detalle/GET: si el `projectPublicId` no existe en el runtime del workspace, el vínculo se **omite** (carga y consistencia, no ACL fina por proyecto en esta capa; si en el futuro hubiera lectura por proyecto, se podría filtrar además).

## Permisos (v1, conservador)

- **Lectura** (`teams.read` lógica): miembros con estado `active` o `active_without_seat` (cualquier rol: SM, PO, dev, coach, auditor, etc. según tengan acceso al workspace). Excluidos: `pending`, `deactivated`.
- **Mutación** (crear/editar, miembresías, vínculos, liderazgo): `admin`, `operator`, `agility_lead` únicamente.
- **Lectura del log de auditoría** (`teams.audit.read` lógica): subconjunto **más estricto** — `admin`, `operator`, `agility_lead` (no basta con poder listar equipos en solo lectura operativa).

## Auditoría

Eventos: creación, actualización, cambio de estado, cambio de líder, alta/baja de miembro, vinculación/desvinculación de proyecto. Payloads con **before/after** donde aplica. Lectura restringida (ver arriba).

## Postergado (exclusiones v1)

- `teamType`, `relationshipType: primary` en Project ↔ team.
- `teamPublicId` en work items, heurísticas de equipo por ítem, vista "mis equipos" en perfil, equipos temporales / `validUntil`, métricas y reporting avanzado por equipo.
- Reglas de RBAC per-proyecto para ocultar vínculos: **no** modeladas aún; solo se omiten vínculos huérfanos (proyecto inexistente) y se documenta la postura.

## Relación con Scrum / Kanban

Proyecto materializado (runtime) del mismo workspace: los vínculos son asociación operativa. El equipo **no** cambia permisos del backlog ni del tablero.

## Transacciones

`runWithTransactionPreferred` ahora, si no hay sesión transaccional Prisma cuando está disponible
