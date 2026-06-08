# Alineamiento Diario (`daily-alignment`)

Backend v1 para **alineación de equipo** en la sesión diaria (especialmente Scrum), alineado a `contracts-docs/docs/modules/daily-alignment/*`.

## Propósito y límites

- **Alineación**, no fiscalización: no hay scoring, juicio de desempeño ni “verdad” automática sobre el texto del usuario.
- **Modelo híbrido:** cada participante guarda su bloque (ayer / hoy / impedimentos); el facilitador cierra con resumen, acuerdos, escalados y seguimientos.
- **Actividad registrada** (tiempos + eventos de auditoría de tablero/backlog/tiempos) sirve como **insumo** para sugerencias y señales suaves.

## API HTTP (v1)

Prefijo:

`GET|POST /v1/workspaces/:workspacePublicId/projects/:projectPublicId/daily-alignment/...`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/today` | Bootstrap: `supportLevel`, TZ usada, `sessionDate`, sesión si existe |
| GET | `/today/my-update` | Aporte del actor + bloque de sugerencias/hints (si aplica) |
| POST | `/today/my-update` | Upsert del aporte; **creación lazy** de sesión |
| GET | `/today/session` | Vista de sesión + participantes + esperados/faltantes |
| POST | `/today/close` | Cierre por SM / agility_lead / admin / operator |
| GET | `/recent?limit=` | Historial corto de sesiones |

Query opcional: `sessionDate=YYYY-MM-DD`, `sessionSlot` (default `default`).

## Soporte por enfoque (`operationalApproach`)

| Enfoque | `supportLevel` | Comportamiento |
|----------|----------------|----------------|
| `scrum` | `full` | Mutaciones permitidas |
| `kanban` | `flow_check_in` | Mismos endpoints; copy/UI puede adaptarse en cliente |
| `predictive_phases` | `unsupported` | `POST` de aporte/cierre → **409** `daily_alignment_unsupported` |

## Permisos

- **Lectura** (bootstrap, my-update, session, recent): `assertCanReadProjectRuntime`.
- **Aporte propio:** mismo criterio + miembro no desactivado.
- **Cierre:** `scrum_master`, `agility_lead`, `admin`, `operator`.

El **Scrum Master no puede editar** el aporte ajeno: no existe endpoint para ello.

**Product Owner (v1):** puede **leer** y **guardar su propio aporte** como miembro metodológico, pero **no** puede **cerrar** la sesión (política explícita; ver `policies/daily-alignment-authorization.policy.test.ts`).

## Contratos HTTP y errores habituales

| Situación | Status | `error` (típico) |
|-----------|--------|-------------------|
| Sin `Authorization: Bearer` | 401 | `unauthorized` (middleware login) |
| Usuario autenticado pero no miembro del `workspacePublicId` de la ruta | 403 | `forbidden` + `not_workspace_member` |
| Miembro sin permiso de lectura runtime (p. ej. desactivado) | 403 | `project_runtime_forbidden` |
| Sin permiso de cierre | 403 | `daily_alignment_forbidden` |
| Proyecto operativo inexistente / no accesible | 404 | `daily_alignment_not_found` |
| Query/path/body inválido (Zod) | 400 | `invalid_query` / `invalid_path_params` / `invalid_body` |
| Validación de negocio (slot ilegal, etc.) | 400 | `daily_alignment_validation` |
| Sesión cerrada, predictive en mutación, etc. | 409 | `daily_alignment_conflict` / `daily_alignment_unsupported` |

Los errores de dominio `workspace-project-runtime` se mapean como en el resto de rutas por proyecto (`ProjectRuntimeForbiddenError` → **403**).

## Pruebas automatizadas

- Servicio / sugerencias / calendario: `*.test.ts` bajo este módulo.
- **HTTP (Express real + dobles in-memory):** `routes/daily-alignment.routes.test.ts` — ejercita status codes, permisos y degradación Scrum/Kanban/Predictive.
- **Política de cierre:** `policies/daily-alignment-authorization.policy.test.ts`.
- Dobles compartidos (repos en memoria, `FakeProjectRuntime`): `daily-alignment.in-memory.fixtures.ts` (excluido del `tsc` de producción; solo tests/tsx).

## Sesión (persistencia)

Colección `daily_alignment_sessions`. Clave única: `(workspacePublicId, projectPublicId, sessionDate, sessionSlot)`.

- `status`: `open` | `closed` | `closed_incomplete` (faltan aportes esperados al cerrar).
- `alignmentMode`: `live` | `async`.
- `operationalTimeZone`: IANA resuelta vía `WORKSPACE_OPERATIONAL_TIME_ZONE` o **`UTC`** (fallback documentado).
- `sprintPublicId`: rellenado en creación lazy si `operationalApproach === "scrum"` y hay sprint `active`.

## Participantes esperados (OQ-13 v1)

Usuarios activos con rol metodológico `scrum_developer`, `scrum_master` o `product_owner` que pertenecen a **equipos vinculados al proyecto** (`work_team_project_link` + membresías activas).

**Fallback:** si no hay vínculos de equipo al proyecto, se usan **todos** los miembros activos del workspace con esos tres roles (documentar en producto si se ajusta).

## Umbrales de sugerencias (OQ-3)

En el **día laborable previo** al `sessionDate` (en TZ operativa):

- Base suficiente si **≥ 30 min** de tiempo registrado **o** **≥ 2** eventos en auditoría (categorías tablero/backlog/time_entry) con `actorUserPublicId` del usuario.

Los **time logs** se agregan con `workDate` en rango UTC `[refYmd 00:00Z, siguiente día)` — misma disciplina UTC que `work-item-time-logging` (ver limitación en TZ cruzada en código de producto).

## Auditoría

Categoría `daily_alignment_session` en `workspace_audit_events`:

- `daily_alignment_session_created_lazy`
- `daily_alignment_participant_update_upserted`
- `daily_alignment_session_closed`

## Postergado (no v1)

- Scoring / RH / IA generativa
- Integración rica obligatoria con `project-impediments`
- Segundo campo de transcripción libre del facilitador
- Multi-slot UX avanzado (el modelo admite `sessionSlot` ≠ `default`)
