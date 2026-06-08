# workspace-audit-log

Persistencia **append-only** de eventos de auditoría a nivel **workspace** (tenant). Primera categoría: cambios en atributos operativos del ítem de backlog Scrum (`storyPoints`, `priorityLevel`).

## Colección

- **`workspace_audit_events`**

## Campos típicos

| Campo | Descripción |
|--------|-------------|
| `auditEventPublicId` | UUID único del evento |
| `workspacePublicId` | Workspace |
| `category` | `scrum_backlog_item`, `kanban_*`, `time_entry`, `workspace_member`, `workspace_license`, `workspace_billing_portal`, etc. |
| `action` | Depende de `category` (véase enum en esquema y dominio TypeScript). |
| `actorUserPublicId` | Usuario que realizó el cambio |
| `occurredAt` | Marca temporal |
| `resourceProjectPublicId` | Proyecto operativo |
| `resourceBacklogItemPublicId` | Ítem de backlog |
| `previousValue` / `nextValue` | Valores antes/después (`null`, entero o string enum) |

## Alcance MVP

- **Backlog operativo Scrum / Kanban / time entries / WIP** — ver `category` y `action` en el modelo de dominio y `domain/workspace-audit-log-entry.ts`.
- **Gobernanza workspace** (sin proyecto operativo real): categorías `workspace_member`, `workspace_license`, `workspace_billing_portal`; `resourceProjectPublicId` usa el sentinel documentado en `WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID`.
- Escritura desde **`project-scrum-backlog`** (y módulos de tablero/kanban/time/wip) según el caso.
- **Sin** API HTTP de lectura general en esta fase (consumo vía herramientas de datos / futuro admin).

## Pruebas

- Punto de entrada global: `npm test` en `api/` (véase **`api/docs/TESTING.md`**).
- Casos dedicados a append de licencias: `workspace-licenses/services/workspace-license.service.audit.test.ts`.

## Evolución

- Lectura administrada / export / retención.
- Cobertura E2E opcional sobre rutas que disparan auditoría de miembros y portal de billing.
