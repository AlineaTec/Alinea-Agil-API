# project-scrum-backlog

**Product backlog Scrum** del **proyecto operativo** materializado (`workspace-project-runtime`). Solo aplica si `operationalApproach === scrum`. Fuente de verdad documental: `contracts-docs/docs/modules/project-scrum-backlog/`.

## Autorización

- **Lectura** (GET listado/detalle): `assertCanReadScrumBacklog` — `admin`, `operator`, `auditor`, `agility_lead`, `scrum_coach`.
- **Mutación** (POST/PATCH/move): `assertCanMutateScrumBacklog` — `admin`, `operator`, `agility_lead` únicamente.
- **PATCH solo `acceptanceCriteria`:** familia ampliada (`+ scrum_master`, `product_owner`, `scrum_developer`) con permisos granulares — ver `WORK-ITEM-ACCEPTANCE-CRITERIA.md`.
- Detalle en `contracts-docs/.../project-scrum-permissions/harmonization-decisions.md`.

## Rutas (v1)

Base: `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-backlog`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/items` | Lista ítems del proyecto (plano, `sortOrder` ascendente). |
| POST | `/items` | Crea ítem (`itemType`, `title`, …). |
| GET | `/items/:backlogItemPublicId` | Detalle. |
| POST | `/items/:backlogItemPublicId/move` | Reordenar un paso entre **hermanos**: body JSON `direction`: `up` o `down`. Respuesta `{ item, moved }`. |
| PATCH | `/items/:backlogItemPublicId` | Actualización parcial (sin cambiar `itemType`). Puede incluir `acceptanceCriteria` (reemplazo completo de lista); ver `WORK-ITEM-ACCEPTANCE-CRITERIA.md`. |

Respuestas usan envelope `{ items }` o `{ item }` con fechas en ISO 8601.

### Move (reordenamiento simple)

- Solo afecta al grupo de ítems con el **mismo** `parentItemPublicId` (raíz = `null`).
- Orden entre hermanos: `sortOrder` ascendente, desempate `createdAt`.
- Tras un intercambio válido, se **renumeran** los `sortOrder` del grupo como `0 … n-1` para evitar ambigüedad si había empates.
- Si el ítem ya es el **primero** y `direction === "up"`, o el **último** y `direction === "down"`: **HTTP 200**, `moved: false`, `item` sin cambios (idempotente). No se escribe en base de datos.
- No cambia padre, tipo ni nivel; no mueve entre grupos.

## Modelo (MVP)

- Tipos: `epic`, `user_story`, `task`, `subtask`
- Estados: `open`, `in_progress`, `done`
- `sortOrder` entero por **hermanos** (mismo `parentItemPublicId` en el proyecto); por defecto `max(hermanos)+1`
- Jerarquía: épica sin padre; historia sin padre o bajo épica; tarea bajo historia; subtarea bajo tarea
- **Sin** borrado, **sin** sprint linkage, **sin** drag-and-drop ni reorder masivo

### Atributos operativos (`work-item-operational-fields`)

Documentación: `contracts-docs/docs/modules/work-item-operational-fields/`.

| Campo | Tipo JSON | Reglas MVP |
|-------|-----------|------------|
| `storyPoints` | `number \| null` | `null` = sin estimar (no usar `0` como “no estimado” en contrato de producto). Entero `0…1000` solo en `user_story` y `task`. En `epic` y `subtask` la API expone siempre `null`; PATCH con número entero → **400**. `null` en PATCH en épica/subtarea permitido (idempotente). |
| `priorityLevel` | string | `none` \| `low` \| `medium` \| `high` \| `urgent`. Complementario al orden del backlog; **no** reordena listas solo. |

- **POST** `/items` y **PATCH** `/items/:id` aceptan estos campos (PATCH parcial).
- Tras **PATCH** que cambie `storyPoints` o `priorityLevel`, se escribe un evento en **`workspace_audit_events`** (`workspace-audit-log`). La creación inicial con valores no nulos/`none` **no** genera evento de auditoría en esta fase (solo mutaciones explícitas vía PATCH).
- **Responsable:** sigue en `work-item-assignment` (no duplicado aquí).
- **Fricción:** si la inserción en audit log falla después de persistir el ítem, el cliente recibirá error pero el ítem puede haberse actualizado; reintentar o reconciliar vía datos.

### Criterios de aceptación (`work-item-acceptance-criteria`)

Documentación de implementación: **`WORK-ITEM-ACCEPTANCE-CRITERIA.md`**.

- POST/PATCH: campo opcional `acceptanceCriteria` (máx. 20, texto ≤4000, estados `pending` \| `done` \| `reviewed`).
- Respuestas incluyen `acceptanceCriteria` y `acceptanceCriteriaSummary` (conteos).
- Épica/subtarea: lista no vacía → **400**.

#### TODOs (otros slices)

- Rollup de story points en épicas (fase 2).
- Edición en board / métricas agregadas por puntos.
- Kanban: `priorityLevel` reutilizable; `storyPoints` opcional.

## Seguridad

Bearer + `workspaceUsersAuthMiddlewares`. Política conservadora alineada al runtime en esta fase: **admin**, **operator** o **agility_lead**, miembro activo.

Antes de operar, el servicio llama a `ProjectRuntimeService.requireScrumWorkspaceRuntimeProject` (proyecto existe, mismo workspace, enfoque Scrum).

## Decisiones conservadoras

- **Historia sin épica:** permitida (`parentItemPublicId` null).
- **Esquema unificado en tabla `work_items`
- **PATCH** no permite cambiar `itemType` (evita inconsistencias en MVP).
- **Ciclos:** al cambiar `parentItemPublicId`, se valida que el nuevo padre no sea descendiente del ítem.

## TODOs posteriores

- Borrado lógico, reorder masivo, vínculo a sprint, permisos finos por rol de producto.
- Criterios: sub-rutas, historial por criterio, plantillas (ver `WORK-ITEM-ACCEPTANCE-CRITERIA.md`).
