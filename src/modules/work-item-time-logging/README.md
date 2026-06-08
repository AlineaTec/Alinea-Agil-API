# work-item-time-logging (v1 API)

## Propósito

Registro **operativo** de **minutos de trabajo** asociados a un **work item** (backlog compartido Scrum/Kanban). Es un módulo ligero de **time logging por ítem**, no un timesheet corporativo ni nómina.

## Qué es una entrada de tiempo

- **Manual** (v1): el usuario registra minutos y una **fecha de trabajo** (`workDate`, día de calendario en **UTC** `YYYY-MM-DD`).
- **Unidad**: minutos **enteros**, `minutesSpent > 0`, sin decimales.
- **Autor del registro**: `userPublicId` y `createdByUserPublicId` reflejan al usuario que crea la fila; **no** se imputa al asignado del ítem (pueden coincidir o no).
- **Total por ítem**: **derivado** por suma de entradas; no hay total editables a mano en el ítem.

## Qué no es

- Timesheet global, timer sofisticado, aprobaciones multi-nivel.
- Nómina, facturación, coste/hora.
- **No** reabre en código las decisiones de `contracts-docs` (fechas futuras, decimales, etc.).

## Reglas básicas v1 (soportadas en backend)

| Regla | Comportamiento |
|--------|----------------|
| `minutesSpent` | Entero, `1…1440` (máx. 24 h por entrada). |
| `workDate` | Día de calendario; **permitida** retroactividad; **no** puede ser un día **futuro** respecto a “hoy” **UTC** en v1. |
| `note` | Opcional, máx. 2000 caracteres. |
| Total del ítem | Suma de minutos de todas las entradas (hard delete, sin soft delete v1). |
| Ítem `done` / cerrado | **Sí** se puede registrar en v1 (trabajo de soporte o corrección; sin estado “archivado” aún en el modelo de ítem). |

## Autor vs asignado

- `assertCan…` y la visibilidad del ítem siguen la misma lógica base que **comentarios** (lectura backlog/board).
- **“Propio / ajeno”** de una entrada = comparar `actor.userPublicId` con **`createdByUserPublicId`** (creador de la fila), alineado a comentarios.
- Quién puede “crear” = quien pueda añadir comentario (p. ej. excluye auditor y scrum coach en la mutación; ver política reutilizada).

## Permisos (capacidades lógicas)

| Lógica | En código v1 |
|--------|----------------|
| `time-entries.read` | `assertCanReadWorkItemComments` (misma unión de roles que comentarios). |
| `time-entries.create` | `assertCanMutateOwnWorkItemComment` |
| `time-entries.update-own` / `delete-own` | Misma mutación “propia” + restricción de autoría (`createdByUserPublicId`). |
| `time-entries.update-any` / `delete-any` | `assertCanMutateSprintBoard` (admin, operator, agility_lead, scrum_master, product_owner) |

Rol `auditor` y `scrum_coach` pueden leer, no mutar, como comentarios.

## Rutas HTTP (convención del repo)

El segmento de ítem en URL es `backlogItemPublicId` (mismo id que en contratos bajo el nombre work item). Base:

- Scrum: `GET|POST|PATCH|DELETE` … `/v1/workspaces/:w/projects/:p/scrum-backlog/items/:backlogItemPublicId/time-entries`
- Kanban: bajo `…/kanban-backlog/items/:backlogItemPublicId/time-entries`
- Sufijos: `POST` crea, `GET` lista, `PATCH|DELETE` … `/time-entries/:timeEntryPublicId`

`GET` devuelve `timeEntries`, `summary` (totales, `entryCount`, `lastLoggedAt`, `lastTimeEntryByUserPublicId`), `nextCursor` (paginación como comentarios), y cada entrada expone `canUpdate` / `canDelete` en función del actor.

## Auditoría (workspace)

Categoría `time_entry` y acciones `time_entry_created` | `time_entry_updated` | `time_entry_deleted` con `previousValue` / `nextValue` (payload acotado: ids, `minutesSpent`, `workDateYmd`, `note`). En **create** no hay snapshot previo: se persiste `previousValue: {}` (el contrato de auditoría usa objetos vacíos en lugar de `null`

## Extensiones analíticas (postpuestas)

- Agregados por proyecto, por usuario, por equipo, estimado vs real, métricas de flujo, reporting — **misma** entidad e índices por `(workspace, project, workItem, workDate/createdAt)` habilitan consumo **sin** fijar aún un contrato de reporting.

## Limitaciones v1

- Sin `Idempotency-Key` en `POST`, sin ETag, sin soft delete, sin límite de antigüedad de `workDate` (OQ de contrato).
