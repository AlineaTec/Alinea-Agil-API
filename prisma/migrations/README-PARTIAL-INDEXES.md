# Índices parciales (SQL manual)

Prisma no modela índices con cláusula `WHERE`. Están definidos en migraciones SQL y **deben conservarse** en `migrate deploy`.

| Migración | Tabla | Índice | Condición |
|-----------|-------|--------|-----------|
| `20250606120000_workspace_domain` | `workspace_invitations` | `workspace_invitations_pending_workspace_email_key` | `status = 'pending'` |
| `20250606120000_workspace_domain` | `work_team_memberships` | `work_team_memberships_active_team_user_key` | `is_active = true` |
| `20250608120000_scrum_kanban_domain` | `guided_sprint_planning_sessions` | `guided_sprint_planning_sessions_sprint_bound_key` | `sprint_public_id IS NOT NULL` |
| `20250608120000_scrum_kanban_domain` | `guided_sprint_planning_sessions` | `guided_sprint_planning_sessions_flow_window_key` | `sprint_public_id IS NULL` |
| `20250609120000_guided_sessions_domain` | `guided_retrospective_sessions` | `guided_retrospective_sessions_open_session_code_key` | `session_code` NOT NULL y status abierto |
| `20260606120000_product_feedback_domain` | `product_feedback_submissions` | `pf_unique_user_idea_workspace` | `idea_public_id IS NOT NULL` |

**Convención:** no duplicar estos índices en `schema.prisma`; cualquier cambio pasa por SQL explícito en una nueva migración y actualizar esta tabla.
