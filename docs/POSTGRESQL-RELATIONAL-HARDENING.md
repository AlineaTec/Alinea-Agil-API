# Hardening relacional PostgreSQL (junio 2026)

Implementación en migración `20260704120000_relational_hardening`.

## Implementado

| Cambio | Detalle |
|--------|---------|
| **`kanban_columns`** | Fuente de verdad de columnas Kanban. `flow_definition` queda en `{"schemaVersion":2}`. |
| **`work_items.kanban_column_id`** | FK → `kanban_columns` (ON DELETE SET NULL). `kanban_column_public_id` se mantiene como denorm API. |
| **`work_controls_override_tokens.work_item_id`** | FK NOT NULL → `work_items`. Tokens huérfanos eliminados en migración. |
| **`project_impediments.sprint_id`** | FK opcional → `sprints`. `related_sprint_public_id` denorm. |
| **`platform_tenants.workspace_id`** | FK NOT NULL → `workspaces`. Tenants sin workspace eliminados en migración. |
| **`work_items.completed_in_sprint_id`** | FK opcional → `sprints`. |
| **`projects`** | Índice `(workspace_id, updated_at DESC)` para listados runtime. |
| **Índices parciales** | Inventario en [`prisma/migrations/README-PARTIAL-INDEXES.md`](../prisma/migrations/README-PARTIAL-INDEXES.md). |

## Código adaptado

- `kanban-flow.prisma-repository.ts` — CRUD columnas relacional
- `scrum-backlog.prisma-repository.ts` — resuelve `kanban_column_id` / `completed_in_sprint_id`
- `work-control-override-token`, `impediment`, `platform-tenant` repos
- `project-scope.ts` — `resolveKanbanColumnId`

## Diferido (decisión explícita)

| Tema | Motivo |
|------|--------|
| **`acceptance_criteria` → tabla** | Refactor estructural; el dominio ya valida en TS. Ver auditorías previas. |
| **`sprints.closure/review/retro` → tablas** | Snapshots de ceremonia; métricas leen jsonb en memoria. `needs_product_decision` para BI SQL. |
| **Reducir denorm `*_public_id` en `guided_*`** | Aporta a API/reportes; costo de migración >> beneficio. |
| **FK `assigned_user_public_id` en work_items** | Patrón API por `public_id`; volumen medio de cambio. |

## Tests

- `src/test/postgres/relational-hardening.integration.test.ts`
- Suite existente: `npm run test:postgres`
