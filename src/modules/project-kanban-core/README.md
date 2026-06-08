# project-kanban-core (API)

Slice **core / configuración del flujo** para proyectos Kanban v1: materialización del flujo por defecto, persistencia y lectura HTTP mínima.

## Alcance actual

- Tras materializar un proyecto operativo con `operationalApproach === "kanban"`, se crea de forma idempotente un documento de flujo con **4 columnas** fijas: Ready → In Progress → Review → Done.
- **`entryColumnPublicId`** apunta siempre a **Ready** (primera columna). No hay columna “Backlog” en la plantilla.
- Cada columna tiene `position` (orden), `wipLimit` (`null` = sin límite; entero ≥ 1 si hay límite) y `policyText`.
- Validación centralizada en `assertValidKanbanFlowColumns` (conteo máximo de columnas, unicidad de ids/posiciones, longitud de nombre y de `policyText`). Pensada para reutilizarla cuando existan PATCH del flujo o validaciones desde backlog/board.

## Fuente de verdad del estado en flujo

El **estado en el flujo** de un ítem (cuando exista board) será la **columna** (`columnPublicId`), no campos paralelos duplicados. Este módulo solo persiste la **definición** del flujo; aún no hay ítems ni transiciones.

## HTTP

- `GET /v1/workspaces/:workspacePublicId/projects/:projectPublicId/kanban/flow`  
  Requiere el mismo permiso de lectura de runtime que el resto de vistas de proyecto. Responde `entryColumnPublicId`, `columns` ordenadas por `position` y `updatedAt`.

## Persistencia

- tabla PostgreSQL

## Integración

- `ProjectDraftService` llama a `KanbanFlowService.ensureInitialFlowAfterKanbanMaterialization` tras crear (o reconciliar) el runtime Kanban.
- Otros módulos server-side pueden usar `getFlowConfigOrThrow` / `findColumnByPublicId` tras validar el proyecto (p. ej. `project-kanban-backlog`); no sustituye permisos de la ruta HTTP `GET .../kanban/flow`.

## Postergado (fuera de este slice)

- Backlog Kanban, board, liberar/mover ítems, bloqueo, métricas, edición del flujo vía API.
