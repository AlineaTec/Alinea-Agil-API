# Work item — criterios de aceptación (backend MVP)

Implementación en **`project-scrum-backlog`**, alineada a `contracts-docs/docs/modules/work-item-acceptance-criteria/`.

## Modelo

- Campo **`acceptanceCriteria`**: arreglo embebido en el ítem (`jsonb` en PostgreSQL).
- Cada elemento: `acceptanceCriterionPublicId` (UUID), `text`, `status` (`pending` \| `done` \| `reviewed`), `createdAt`, `updatedAt`.
- **Sin `sortOrder`** en MVP; el orden es el del arreglo en el body.

## Tipos elegibles

- **`user_story`** y **`task`**: pueden tener criterios.
- **`epic`** y **`subtask`**: **400** si el body incluye `acceptanceCriteria` con **longitud > 0**; si el campo se omite o es `[]`, OK. En lectura el mapper fuerza `[]` para esos tipos.

## Validación

- Máximo **20** criterios por ítem.
- `text` trim no vacío, máximo **4000** caracteres.
- `status` debe ser uno de los tres valores permitidos.
- **IDs**: si se envía `acceptanceCriterionPublicId`, debe existir ya en el ítem; si no existe → **400**. Si se omite o es `null`, el backend genera un UUID nuevo.
- Al actualizar por id existente se **preserva `createdAt`**.
- Transiciones de estado libres (bidireccionales), validadas luego por permisos.

## PATCH — reemplazo completo de lista

Si el body incluye **`acceptanceCriteria`**, la lista enviada **sustituye por completo** la lista persistida (no hay PATCH incremental por criterio).

**Ventaja:** implementación simple y predecible.  
**Fricción:** el cliente debe enviar la lista completa en cada actualización; riesgo de pisar cambios concurrentes (fase 2: sub-rutas o ETag).

## Permisos (MVP, conservador)

### PATCH solo con `acceptanceCriteria` (única clave en el body)

Pueden: **`admin`**, **`operator`**, **`agility_lead`**, **`scrum_master`**, **`product_owner`**, **`scrum_developer`**.

No pueden: **`auditor`**, **`scrum_coach`** (lectura de backlog/board sigue según otras políticas).

Dentro de ese PATCH se aplican reglas **granulares** (comparando lista anterior vs nueva):

| Acción | Roles permitidos (resumen) |
|--------|----------------------------|
| Añadir criterio o editar texto (sin estado `reviewed` en juego) | Coordinación **o** `scrum_developer` |
| Pasar a **`reviewed`** o **quitar** `reviewed` | Solo coordinación: admin, operator, agility_lead, scrum_master, product_owner |
| Cambiar solo entre **`pending`** / **`done`** | Coordinación **o** `scrum_developer` |
| Editar texto mientras el criterio está o pasa por **`reviewed`** | Solo coordinación |
| **Eliminar** criterio con sprint **activo** para el ítem | Solo coordinación (no `scrum_developer`) |
| **Eliminar** sin sprint activo | Coordinación **o** `scrum_developer` |

“Sprint activo” = el ítem tiene membresía en algún sprint del proyecto con `status === "active"`.

### PATCH mixto (`acceptanceCriteria` + otros campos)

Solo **`assertCanMutateScrumBacklog`**: **`admin`**, **`operator`**, **`agility_lead`**.

No se aplican las reglas granulares anteriores: esos tres roles pueden cambiar criterios libremente en la misma petición que título, puntos, etc.

**Fricción:** `scrum_master` / `product_owner` **no** pueden usar un único PATCH mixto; deben usar **solo** `acceptanceCriteria` para criterios, o pedir a agility_lead/admin/operator el PATCH mixto.

## JSON de respuesta (ítem)

Cada ítem expone:

- **`acceptanceCriteria`**: lista completa (fechas ISO8601).
- **`acceptanceCriteriaSummary`**: `{ totalCriteriaCount, pendingCriteriaCount, doneCriteriaCount, reviewedCriteriaCount }`.

## Board

`GET .../scrum-sprints/:sprintPublicId/board` incluye en cada fila **`acceptanceCriteriaSummary`** (mismos contadores). Sprint **cerrado**: el resumen se calcula desde el ítem **actual** en backlog (no forma parte del snapshot de cierre); puede diferir del estado histórico exacto — ver TODO abajo.

## Auditoría

Acción **`acceptance_criteria_updated`** en `workspace_audit_events` con `previousValue` / `nextValue` como **string** (digest JSON estable de id+text+status por criterio). No es historial por criterio.

## TODOs / fase 2

- Sub-rutas `PATCH .../acceptance-criteria/:criterionId` y/o ETag.
- Historial dedicado por criterio en UI/API.
- Incluir resumen de criterios en el **snapshot** de cierre de sprint si se requiere lectura histórica fiel.
- Plantillas de criterios; Kanban; reglas de bloqueo de cierre.
