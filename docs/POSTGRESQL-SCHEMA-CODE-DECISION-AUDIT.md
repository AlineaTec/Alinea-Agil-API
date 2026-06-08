# Auditoría global: schema PostgreSQL vs código (`api/`)

**Fecha:** junio 2026  
**Complementa:** [`POSTGRESQL-SCHEMA-AUDIT.md`](./POSTGRESQL-SCHEMA-AUDIT.md) (radiografía solo-schema)  
**Alcance:** contraste modelo ↔ uso real en backend. **Sin cambios** en `schema.prisma`, migraciones ni código.

---

## Resumen para decisión rápida

El backend **ya está alineado con un modelo híbrido** heredado de Mongo:

| Capa | Patrón observado en código |
|------|----------------------------|
| **Escritura** | Resuelve `workspace_id` / `project_id` / `work_item_id` vía helpers (`workspace-scope`, `project-scope`, `guided-sessions-scope`) y persiste **ambos** (`*_id` + `*_public_id`). |
| **Lectura API** | Casi siempre filtra por `workspace_public_id` + `project_public_id` + `public_id` del recurso. |
| **Agregados** | `jsonb` se lee/escribe **documento completo**; la lógica parsea en TypeScript (métricas, DoR/DoD, Kanban). |
| **Integridad** | Fuerte en `workspace → project → work_item` por `id`; débil en referencias por `public_id` sueltas y en enlaces Kanban / sprint / override. |

**Veredicto global:** el modelo **funciona para el runtime actual** y no conviene un “big bang” relacional. El retorno está en **endurecer puntos donde el código ya asume estructura fija o hace `WHERE` en SQL**, y en **documentar/sincronizar índices parciales** antes de tocar tablas grandes.

---

## 1. Archivos revisados

| Área | Alcance |
|------|---------|
| Esquema | `prisma/schema.prisma` (67 modelos), 13 migraciones SQL |
| Persistencia | 69× `*.prisma-repository.ts`, `project-scope.ts`, `workspace-scope.ts`, `guided-sessions-scope.ts` |
| Servicios / métricas | sprint-metrics, sprint-closure, team-*-metrics, work-ready-done-controls, kanban-backlog, reports en `workspace-project-runtime` |
| Tests integración | `src/test/postgres/*.integration.test.ts` (patrones de uso) |
| Docs | `POSTGRESQL-*.md`, `POSTGRESQL-MIGRATION-CLOSURE.md`, READMEs de módulos |
| Validación | `npm run build` OK (sin edits) |

**No modificado:** schema, migraciones, repos, servicios, `web`/`admin`/`landing`.

---

## 2. Patrones transversales del código (antes de tablas)

### 2.1 Acceso Prisma por tabla (conteo `prisma.<model>` en `src/`)

| Modelo Prisma | Llamadas ~ | Repos / notas |
|---------------|----------:|---------------|
| `workItem` | 15 | `scrum-backlog`, kanban backlog (mismo repo) |
| `workspaceMember` | 15 | membresía, métricas equipos |
| `guidedRetrospectiveSession` | 13 | + hijos (votes, topics, …) |
| `guidedSprintPlanningSession` | 12 | planning guiado |
| `guidedReviewSession` | 11 | review guiado |
| `guidedRefinementSession` | 10 | refinement |
| `billingWorkspaceSnapshot` | 9 | webhooks / enforcement |
| `sprint` / `sprintAssignment` | 7–8 | scrum-sprint-planning |
| `project` | 8 | project-runtime |
| `kanbanFlowConfig` | 3 | flujo 1:1 proyecto |
| `workControlOverrideToken` | 3 | override sin validar work_item en BD |
| Audit / paddle / email | 1–4 | append-only, bajo volumen |

### 2.2 Convención de queries

```
HTTP (public_id) → Repository.find*(workspace_public_id, project_public_id, …)
                 → opcional resolve*Id() → create/update con workspace_id + project_id
```

- **Updates de negocio** en `work_items`, `sprints`, `project_drafts`: `updateMany` por `(workspace_id, project_id, public_id)` — coherente con FK internas.
- **Listados**: `findMany` por `(workspace_public_id, project_public_id)` — apoya índices/uniques en `public_id`, no siempre en `workspace_id` solo.
- **Resolvers** (`src/infrastructure/postgres/project-scope.ts`, `guided-sessions-scope.ts`): convierten tripleta API → `id` para hijos con FK.

### 2.3 ¿Coincide el schema con el código?

| Aspecto | ¿Coincide? | Comentario |
|---------|------------|------------|
| Tenancy `workspace_id` + denorm `workspace_public_id` | **Sí, por diseño** | El código **requiere** ambos en casi cada `create`. |
| API solo `public_id` | **Sí** | Rutas y repos no exponen `id` UUID interno al cliente. |
| `jsonb` como documento | **Sí** | Mappers hacen cast a tipos dominio; no hay `jsonb_path_query`. |
| FK usuario por `public_id` | **Sí** | Impedimentos, time entries, retro, etc. usan `user_public_id` con FK Prisma. |
| Kanban columna | **No** | SQL filtra `kanban_column_public_id`; columna vive en `flow_definition` jsonb. |
| Sprint en impedimentos | **Parcial** | Código filtra `related_sprint_public_id`; sin FK ni `sprint_id`. |
| Override token → ítem | **No** | Solo `work_item_public_id`; consumo no valida existencia en BD. |

---

## PARTE A — Inventario pragmático por tabla

Leyenda **decisión**: `keep` | `harden` | `review` | `refactor_later`  
**Uso código**: `alto` | `medio` | `bajo` | `solo_audit`

> Detalle PK/UQ/FK/IDX completo en [`POSTGRESQL-SCHEMA-AUDIT.md`](./POSTGRESQL-SCHEMA-AUDIT.md). Aquí: **propósito + uso real + decisión**.

### Identity

| Tabla | Dominio | Uso código | Decisión | Notas diseño |
|-------|---------|------------|----------|--------------|
| `identity_users` | Auth | `identityUser` 9×; login, preferred workspace | **keep** + **harden** opcional | `preferred_active_workspace_public_id` leído/escrito sin FK (`identity-user-for-auth`) |
| `identity_auth_sessions` | Sesión | 4×; token_hash, expires | **keep** | FK a `user_id` ✓ |
| `identity_password_reset_tokens` | Reset | 5× | **keep** | |
| `identity_registration_intents` | Onboarding | 13×; provisioning | **keep** | `metadata` jsonb; provisioned_* sin FK (proceso) |
| `identity_verification_challenges` | OTP | 5× | **keep** | |

### Workspace / equipos

| Tabla | Dominio | Uso código | Decisión | Notas |
|-------|---------|------------|----------|-------|
| `workspaces` | Tenant | 10× prisma + hub relaciones | **keep** | Settings repo actualiza por `public_id` |
| `workspace_owner_memberships` | Owner | 2× | **keep** | Provisioning |
| `workspace_members` | Miembros | 15× | **keep** | FK user `public_id`; listados por workspace |
| `workspace_invitations` | Invites | 8× | **keep** | Índice parcial pending (SQL) |
| `workspace_licenses` | Asientos | 4× | **keep** | 1:1 |
| `work_teams` | Equipos | 8× | **keep** | |
| `work_team_memberships` | Miembros equipo | 7× | **keep** | Índice parcial activos (SQL) |
| `work_team_project_links` | Enlace proyecto | 6× | **keep** | FK fuerte proyecto |

### Projects / backlog

| Tabla | Dominio | Uso código | Decisión | Notas |
|-------|---------|------------|----------|-------|
| `project_drafts` | Wizard | 5×; jsonb charter/trace | **keep** | Documento de proceso; list `workspace_id+updated_at` |
| `projects` | Runtime | 8×; list por `workspace_public_id` | **review** index | Sin `@@index` listado; código ordena `updated_at` |
| `work_items` | Backlog unificado | 15×; scrum + kanban | **refactor_later** parcial | AC, history, kanban col, `comments_count` |
| `work_item_comments` | Comentarios | 6× | **keep** | Servicio incrementa contador en `work_items` (no transacción fuerte) |
| `work_item_time_entries` | Tiempo | 9× | **keep** | FK user `public_id` |
| `work_activity_notifications` | Notifs | 9× | **keep** | Índices unread |
| `work_item_implicit_follows` | Follows | 3× | **keep** | |

### Scrum / Kanban

| Tabla | Dominio | Uso código | Decisión | Notas |
|-------|---------|------------|----------|-------|
| `sprints` | Sprint | 7×; closure jsonb → métricas | **refactor_later** jsonb | `SprintMetricsService` parsea `closure.items` en memoria |
| `sprint_assignments` | Compromiso | 8× | **keep** | Unique compuesto; FK fuertes |
| `guided_sprint_planning_*` | Planning guiado | 12+4+3× | **keep** + **review** denorm | Índices parciales sprint_bound (SQL) |
| `kanban_flow_configs` | Flujo | 3×; jsonb columns | **refactor_later** | `findMany` work_items por `kanban_column_public_id` |

### Guided sessions (12 tablas)

| Grupo | Uso código | Decisión | Notas |
|-------|------------|----------|-------|
| `daily_alignment_*` | 9+3× | **keep** | Mismo patrón sesión + hijos |
| `guided_refinement_*` | 10+5× | **keep** | Readiness lee AC desde work_item (no SQL) |
| `guided_review_*` | 11+4+2× | **keep** | `affects_work_item_public_ids` array |
| `guided_retrospective_*` | 13+7+8+… | **keep** | Índice parcial `session_code` abierto (SQL) |

Todas: **lectura/escritura por `workspace_public_id` + `project_public_id`**; hijos duplican 5–7 columnas `*_public_id` que ya implica `session_id` FK — **denorm intencional para API**, no usada en joins SQL.

### Impediments / controls

| Tabla | Uso código | Decisión | Notas |
|-------|---------|------------|----------|-------|
| `project_impediments` | 6×; list por `workspace_id+project_id` | **harden** | `related_sprint_public_id` blando |
| `project_impediment_comments` | 6× | **keep** | |
| `work_controls_project_profiles` | 3×; criteria jsonb | **keep** | Evaluator en TS |
| `work_controls_workspace_templates` | 2× | **keep** | 1:1 ws |
| `work_controls_override_tokens` | 3× | **harden** | `work_item_public_id` sin FK |
| `work_controls_audit_events` | 2× | **keep** | Append-only |

### Billing / platform / product / infra

| Tabla | Uso código | Decisión |
|-------|------------|----------|
| `billing_workspace_snapshots` | 9× | **keep** |
| `billing_paddle_webhook_processed_events` | 1× | **keep** |
| `billing_notification_sends` | 3× | **keep** |
| `billing_workspace_audit_events` | 3× | **keep** |
| `payment_workspace_receipts` | 6× | **keep** |
| `payment_receipt_year_sequences` | 1× | **keep** |
| `payment_receipt_orphan_events` | 2× | **keep** |
| `platform_users` / `platform_access_sessions` / `platform_password_reset_tokens` | 4–8× | **keep** |
| `platform_tenants` | 6× | **harden** | Sin FK `workspaces`; lookup por `workspace_public_id` |
| `platform_audit_events` | 4× query | **keep** |
| `product_*` | 5–6× | **keep** | Partial unique submissions+idea (SQL) |
| `project_operating_snapshot_nba_snoozes` | 3× | **keep** |
| `transactional_email_outbound_messages` | 1× | **keep** |
| `*_audit_events` (workspace, impediment, team, product, work_controls) | 1–5× insert | **keep** | Sin FK actor — coherente append-only |
| `infrastructure_connectivity_probe` | 4× tests | **keep** |

---

## PARTE B — Cruce schema vs código (dominios foco)

### `workspaces` + `workspace_members`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide modelo y uso? | **Sí.** Repos y políticas usan `workspace_public_id` en API; FK `workspace_id` en hijos. |
| ¿Columnas muertas? | No detectadas en repos. |
| ¿Lógica sin FK? | `identity_users.preferred_active_workspace_public_id` — solo preferencia UI. |
| ¿Mejor diseño? | Mantener; endurecer FK preferida = **quick_win** bajo valor. |

**Decisión:** `keep` (tenant estable).

---

### `projects` + `project_drafts`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | **Sí.** Materialización: draft → `projects.source_draft_public_id` FK a draft `public_id` (código + schema). |
| Queries reales | `findFirst`/`list` por `workspace_public_id`; `updateMany` por `source_draft_public_id`. |
| jsonb | Draft: charter/assessment/trace — **solo lectura documental** en wizard. Project: `initial_configuration_summary` — resumen post-materialización, bajo churn. |
| Hueco | Listado proyectos sin índice `(workspace_id, updated_at)` — código hace `orderBy updated_at desc`. |

**Decisión:** `projects` → **index_only**; `project_drafts` → **keep**.

---

### `work_items` (tabla más transversal)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | **Parcial.** Una tabla sirve Scrum + Kanban + asignación + AC + contador comentarios. |
| Lecturas | `listByProject`: `(workspace_public_id, project_public_id)`; kanban: `kanban_column_public_id` + sort. |
| Escrituras | `updateMany`: `(workspace_id, project_id, public_id)`; parent resuelto a `parent_item_id` FK. |
| jsonb fijo en código | `acceptance_criteria` — políticas, closure, DoR/DoD, refinement readiness; `assignment_history` — rutas asignación. |
| Denorm | `comments_count` — increment atómico en repo backlog; README admite desincronización rara sin transacción multi-tabla. |
| Sin FK | `kanban_column_public_id`, `completed_in_sprint_public_id`, varios `*_user_public_id` de asignación. |

**¿Bien diseñada para uso real?** **Sí como agregado operativo** (patrón documento); **no** como modelo analítico relacional.

**Decisión:** `keep` núcleo; **refactor_later** AC y columna Kanban; **harden** sprint completado opcional.

---

### `sprints` + `sprint_assignments`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | Assignments: **sí** (FK + unique + índices orden). Sprints: **sí** para CRUD; **jsonb** es el agregado de ceremonia. |
| Uso closure | `SprintMetricsService`, burndown, carryover, closure service — leen `sprint.closure.items[]` con schema TS estricto. |
| SQL sobre jsonb | **No** — todo en memoria tras `findFirst`. |
| review / retrospective | Misma forma documento; guided sessions **también** persisten transcript en tablas propias (duplicación conceptual, no duplicación de fila). |

**Decisión:** `sprint_assignments` **keep**; `sprints` jsonb → **jsonb_review** (documentar contrato + tests); normalización tablas = **structural_refactor** solo si hay reporting SQL.

---

### `kanban_flow_configs`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | 1:1 `project_id`; repo carga/guarda `flow_definition` entero. |
| Conflicto | `work_items.kanban_column_public_id` validado en **dominio** contra columnas del json; BD no impide columna huérfana. |
| Queries | `findMany` where `kanban_column_public_id = X` — **índice compuesto existe** ✓ |

**Decisión:** **structural_refactor** tabla `kanban_columns` (alto retorno integridad); hasta entonces **documentar** invariante en código.

---

### `guided_*` (12 tablas)

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | **Sí.** Patrón uniforme: sesión por slot fecha+proyecto; hijos por `session_id` + denorm API. |
| ¿Columnas redundantes? | Sí (`workspace_public_id` en hijos) — **aportan**: evitan join en listados API y reportes (`workspace-project-runtime` services). |
| ¿Relaciones solo en código? | Baseline `committed_work_item_public_ids[]` — sin tabla puente; planning candidatos sí tienen FK `work_item_id`. |
| Índices parciales | Retro `session_code`, planning sprint_bound — **solo en SQL**. |

**Decisión:** **keep** estructura; **index_only** / sincronizar Prisma comments; **no** normalizar public_ids masivamente (costo >> beneficio).

---

### `project_impediments`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | Listados usan `workspace_id+project_id` (óptimo). Filtros por `related_sprint_public_id` / `responsible_user_public_id`. |
| FK work_item | **Sí** (`related_work_item_id` opcional en schema — verificar uso en insert) |
| Sprint | Solo `related_sprint_public_id` string — código filtra, BD no valida. |

**Decisión:** **fk_conversion** `sprint_id` opcional = **quick_win**.

---

### `work_controls_*`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | `criteria` jsonb — perfil/template leído entero; `work-ready-done-criteria.evaluator` case por `ruleId`. |
| Override | Token guarda `work_item_public_id`; servicio valida ítem en app antes de crear — **no en INSERT DB**. |
| Columnas kanban en profile | Referencia `column_public_id` dentro de criteria — mismo problema Kanban. |

**Decisión:** profiles **keep**; override **fk_conversion**; criteria **documentar** esquema JSON.

---

### `billing_*` + `transactional_email_outbound_messages`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | **Sí.** Repos acotados; snapshots 1:1; webhooks idempotentes por `event_id`. |
| Queries | Por `workspace_id` / `workspace_public_id` según tabla; índices alineados. |

**Decisión:** **keep** (no tocar salvo tuning índices si crece volumen audit).

---

### `platform_*`

| Pregunta | Respuesta |
|----------|-----------|
| ¿Coincide? | Users/sessions **sí**. |
| `platform_tenants` | Solo `workspace_public_id` unique — **sin FK** a `workspaces`; catálogo y métricas resuelven en código. |
| Riesgo | Workspace borrado (cascade) deja tenant huérfano — **needs_product_decision** (¿cascade platform?). |

**Decisión:** **fk_conversion** tenant→workspace = **medium** prioridad.

---

## PARTE C — Diagnóstico de normalización

| Hallazgo | Sev. | Etiqueta | Evidencia código |
|----------|------|----------|------------------|
| `kanban_column_public_id` sin entidad columna | **high** | `structural_refactor` | `scrum-backlog` WHERE columna; validación dominio kanban |
| `sprints.closure/review/retro` jsonb con forma fija | **high** | `structural_refactor` (largo plazo) | `SprintMetricsService` itera `closure.items` |
| `acceptance_criteria` jsonb array tipado | **high** | `structural_refactor` (largo plazo) | DoR/DoD, refinement, impediment AC counts |
| Denorm masiva `*_public_id` en hijos guided | **medium** | `leave_as_is` | Todos los repos guided escriben denorm; reportes filtran por pub |
| `comments_count` vs filas comments | **medium** | `leave_as_is` | Increment explícito; doc trade-off |
| `work_items` mezcla Scrum+Kanban | **medium** | `leave_as_is` | Un repo unificado — simplifica código |
| `platform_tenants` sin `workspace_id` | **medium** | `constraint_hardening` | `platform-tenant.prisma-repository` |
| `work_controls_override_tokens.work_item` blando | **high** | `constraint_hardening` | create sin resolveWorkItemId |
| `project_impediments.related_sprint` blando | **medium** | `constraint_hardening` | filter en `buildWhere` |
| Audit sin FK actor | **low** | `leave_as_is` | Solo insert append |
| `identity_registration_intents` agregado proceso | **low** | `keep` | FSM onboarding |
| `sprint_assignments` / `work_team_project_links` | — | `keep` | Bien normalizados |

---

## PARTE D — Diagnóstico de `jsonb`

| Ubicación | Consultado en SQL | Tratado como estructura fija en TS | Recomendación |
|-----------|-------------------|-----------------------------------|---------------|
| `work_items.acceptance_criteria` | No | **Sí** (policies, evaluator, closure) | **migrar parcialmente** → tabla AC (largo plazo); corto: **documentar** + validación Zod en borde |
| `work_items.assignment_history` | No | **Sí** (eventos tipados) | **mantener** (append log); opcional tabla eventos si reporting |
| `sprints.closure` | No | **Sí** (métricas v2, burndown) | **mantener** + **documentar** contrato; normalizar solo si SQL reporting |
| `sprints.review` / `retrospective` | No | **Sí** | **mantener** (ceremonia); duplica concepto con `guided_*` pero distinto flujo |
| `kanban_flow_configs.flow_definition` | No | **Sí** (columnas tipadas) | **normalizar** columnas = **alto** retorno con `work_items.kanban_column` |
| `project_drafts.charter`, `trace`, `materialization` | No | Documento wizard | **mantener** |
| `projects.initial_configuration_summary` | No | Resumen | **mantener** |
| `work_controls_*.criteria` | No | **Sí** (ruleId) | **mantener** + documentar; perfil pequeño |
| `guided_*` transcripts / snapshots | No | Mixto | **mantener** (sesión); participant `suggestion_snapshot` = snapshot |
| `*_audit_*.payload` | No | Event sourcing | **mantener** |
| `work_activity_notifications.navigation_target` | No | Pequeño | **mantener** |
| `identity_registration_intents.metadata` | No | Flexible | **mantener** |
| `product_feedback.screen_context` | No | Flexible | **mantener** |

**Regla aplicada:** si aparece en **aggregations de métricas** o **WHERE** indirecto (kanban column) → prioridad subir.

---

## PARTE E — Referencias blandas

| Tabla | Columna | Objetivo | Estado | Valor FK | Costo | Prioridad |
|-------|---------|----------|--------|----------|-------|-----------|
| `work_items` | `kanban_column_public_id` | columnas en `flow_definition` | Validación app | **Alto** integridad | Alto (tabla columnas) | P0 |
| `work_controls_override_tokens` | `work_item_public_id` | `work_items.id` | Solo texto | **Alto** (tokens huérfanos) | Bajo | P0 |
| `project_impediments` | `related_sprint_public_id` | `sprints.id` | Filtro código | Medio | Bajo | P1 |
| `work_items` | `completed_in_sprint_public_id` | `sprints.id` | Blando | Medio | Bajo | P2 |
| `platform_tenants` | `workspace_public_id` | `workspaces` | Unique sin FK | Medio | Medio (datos) | P1 |
| `project_drafts` | `created_by_user_public_id` | `identity_users` | Sin FK | Bajo | Medio | P3 |
| `work_items` | `assigned_user_public_id` | `identity_users` | Sin FK (sí en members) | Medio | Medio | P2 |
| `guided_sprint_planning_baselines` | `committed_work_item_public_ids[]` | `work_items` | Array | Medio integridad | Alto | P2 |
| `guided_review_feedback_entries` | `affects_work_item_public_ids[]` | `work_items` | Array | Bajo | Alto | P3 |
| `workspace_audit_events` | `resource_*_public_id` | varios | Polimórfico | Bajo (audit) | Alto | P3 / leave |
| `identity_users` | `preferred_active_workspace_public_id` | `workspaces` | Preferencia | Bajo | Bajo | P3 |

**Dependencias solo en código (no CHECK en BD):**

- Coherencia `workspace_public_id` ↔ `workspace_id` en cada insert (todos los repos con `resolveWorkspaceId`).
- Conteo `comments_count` ↔ `work_item_comments`.
- IDs de columna Kanban ↔ `flow_definition.columns[].columnPublicId`.
- Conteos AC en sprint closure ↔ filas `acceptance_criteria` en ítems.

---

## PARTE F — Diagnóstico de índices (schema + queries)

### Alineados con código ✓

| Tabla | Índice | Query soportada |
|-------|--------|-----------------|
| `work_items` | `(ws, proj, kanban_column, parent, sort)` | Tablero Kanban por columna |
| `work_items` | `(ws, proj, parent, sort)` | Backlog árbol |
| `sprints` | `(ws, proj, status)` | Listados sprint |
| `sprint_assignments` | por work_item / sprint order | Board, métricas |
| `work_activity_notifications` | recipient unread | Bandeja |
| `project_impediments` | status, updated | Lista filtrada |
| `guided_*` sessions | `(ws, proj, updated)` | Reportes runtime |

### Probables huecos

| Tabla | Recomendación | Evidencia | Riesgo |
|-------|--------------|-----------|--------|
| `projects` | `(workspace_id, updated_at DESC)` o `(workspace_public_id, updated_at)` | `listByWorkspacePublicId` | **index_only**, bajo riesgo |
| `product_feedback_submissions` | `(user_public_id, created_at)` si “mis envíos” | No visto en repo; **needs_query_analysis** | Bajo |
| `work_controls_override_tokens` | `(work_item_public_id)` si FK | lookup consumo | Tras FK |

### Redundancia / drift

| Tema | Severidad |
|------|-----------|
| `public_id` global unique + unique compuesto scope | **low** — redundante pero inofensivo |
| Índices parciales solo en SQL (invites, teams, planning, retro, feedback) | **medium** — documentar en Prisma o `migration.sql` comment |
| Lecturas por `workspace_public_id` sin índice dedicado en `projects` | **medium** — unique compuesto ayuda lookup por pub |

### jsonb e índices GIN

**No recomendados hoy** — el código no filtra por claves jsonb. Si se normaliza AC o columnas Kanban, GIN deja de ser necesario.

---

## PARTE G — Matriz priorizada de decisiones

| Prioridad | Tabla / dominio | Problema | Recomendación | Tipo | Riesgo | Retorno |
|-----------|-----------------|----------|---------------|------|--------|---------|
| P0 | `work_items` + `kanban_flow_configs` | Columna Kanban blanda; SQL filtra `kanban_column_public_id` | Tabla `kanban_columns` + FK; o CHECK deferido | `normalization_refactor` | Alto | Alto |
| P0 | `work_controls_override_tokens` | `work_item_public_id` sin FK | Añadir `work_item_id` FK + backfill | `fk_conversion` | Bajo | Alto |
| P1 | `projects` | List sin índice `updated_at` | Índice compuesto workspace + updated | `index_only` | Bajo | Medio |
| P1 | `project_impediments` | Sprint blando | `sprint_id` nullable FK | `fk_conversion` | Bajo | Medio |
| P1 | `platform_tenants` | Sin FK workspace | `workspace_id` FK | `fk_conversion` | Medio | Medio |
| P1 | Migraciones SQL | Índices parciales no en Prisma | Comentarios / `prisma migrate` sync docs | `constraint_hardening` | Bajo | Medio |
| P2 | `work_items.acceptance_criteria` | jsonb fijo; métricas/DoR | Documentar contrato; plan tabla AC | `jsonb_review` → refactor | Alto | Alto (largo) |
| P2 | `sprints.closure` | jsonb fijo; métricas equipo | Mantener + contrato; refactor si BI SQL | `jsonb_review` | Alto | Medio-Alto |
| P2 | `work_items.completed_in_sprint` | Blando | FK opcional sprint | `fk_conversion` | Bajo | Medio |
| P3 | `guided_*` denorm pub | Redundancia columnas | **No tocar** salvo necesidad storage | `keep` | Alto si cambia | Bajo |
| P3 | `billing_*`, `payment_*`, `identity_auth_*` | — | **keep** | `keep` | — | — |
| P3 | `*_audit_events` | Sin FK actor | **keep** | `keep` | — | — |
| — | `sprint_assignments`, `workspace_licenses`, webhooks | — | **keep** | `keep` | — | — |

---

## PARTE H — Dominios foco (síntesis)

Ver **Parte B** para detalle. Resumen decisión:

| Dominio | ¿Tocar? | Motivo |
|---------|---------|--------|
| `workspaces` | No | Estable, uso correcto |
| `projects` | Solo índice | Listados runtime |
| `project_drafts` | No | jsonb = wizard |
| `work_items` | Sí (Kanban, luego AC) | Desalineación BD ↔ queries |
| `sprints` | Más tarde (jsonb) | Código depende de snapshot; funciona |
| `sprint_assignments` | No | Modelo sano |
| `kanban_flow_configs` | Sí (con work_items) | Integridad columnas |
| `guided_*` | No estructural | Coincide con repos/reportes |
| `project_impediments` | FK sprint | Quick win |
| `work_controls_*` | FK override | Quick win |
| `billing_*` | No | |
| `platform_*` | FK tenant | |
| `transactional_email_*` | No | Ledger append |

---

## Zonas ambiguas (flags)

| Flag | Tema |
|------|------|
| `needs_product_decision` | ¿Normalizar ceremonias Scrum en tablas vs mantener snapshot jsonb para siempre? |
| `needs_product_decision` | ¿Cascade `platform_tenants` cuando se elimina workspace? |
| `needs_query_analysis` | Volumen real listados `projects` por workspace (¿índice urgente?). |
| `needs_query_analysis` | Consultas admin `product_feedback` por usuario. |
| `needs_data_profile` | % tokens override huérfanos; % `kanban_column_public_id` inválidos en prod. |
| `needs_data_profile` | Desincronización `comments_count` en prod. |

---

## PARTE I — Entregables

### 1. Documento

**[`api/docs/POSTGRESQL-SCHEMA-CODE-DECISION-AUDIT.md`](./POSTGRESQL-SCHEMA-CODE-DECISION-AUDIT.md)** (este archivo).

### 2. Top 10 hallazgos

1. **Kanban:** `work_items.kanban_column_public_id` usado en SQL sin FK a columnas en jsonb — **desalineación crítica**.
2. **Patrón dual id/public_id** coherente con API pero duplica mantenimiento en ~todas las tablas hijas.
3. **`sprints.closure` jsonb** es contrato fijo para métricas predictabilidad/burndown — no es “JSON libre”.
4. **`acceptance_criteria` jsonb** alimenta DoR/DoD, refinement, closure — estructura fija en dominio.
5. **Override tokens** sin FK a work_item — integridad solo en servicio.
6. **`projects` list** por `workspace_public_id` sin índice de listado explícito.
7. **Índices parciales** en SQL (planning, retro, invites, feedback) — riesgo drift vs Prisma.
8. **`guided_*`** redundancia `public_id` **sí aporta** a reportes/filtros API — no refactorizar sin motivo.
9. **`platform_tenants`** desacoplado de `workspaces` FK — riesgo huérfanos.
10. **Audit append-only** sin FK — **aceptable** y alineado con código.

### 3. Top 5 quick wins

1. FK `work_controls_override_tokens.work_item_id`
2. FK opcional `project_impediments.sprint_id`
3. Índice `projects (workspace_id, updated_at DESC)`
4. Documentar índices parciales SQL en Prisma/README migración
5. FK `platform_tenants.workspace_id` (con script validación datos)

### 4. Top 5 refactors estructurales

1. Tabla `kanban_columns` (+ FK desde `work_items`)
2. Tabla `work_item_acceptance_criteria` (normalizar AC)
3. Tablas/hijos sprint ceremony o ítems closure normalizados
4. Reducir denorm `*_public_id` en hijos guided (**solo** si hay presión storage/bugs)
5. Tabla puente baseline `committed_work_items`

### 5. Dominios que **no tocaría**

- `sprint_assignments`, `workspace_licenses`, `billing_paddle_webhook_processed_events`
- `identity_auth_sessions`, `identity_password_reset_tokens`
- `work_team_project_links`, `billing_notification_sends`
- `infrastructure_connectivity_probe`
- Tablas `*_audit_events` (salvo requisito compliance FK)
- Bloque `guided_*` (estructura acorde al código actual)
- `transactional_email_outbound_messages`, `payment_receipt_year_sequences`

### 6. Confirmación

- [x] Sin cambios en `schema.prisma`
- [x] Sin migraciones nuevas
- [x] Sin cambios de lógica de negocio
- [x] `npm run build` ejecutado OK

---

## Apéndice — Helpers de scope (contrato código)

```1:47:api/src/infrastructure/postgres/project-scope.ts
// resolveProjectId / resolveWorkItemId / resolveSprintId
// Siempre: workspace_public_id + project_public_id + recurso.public_id → id interno
```

```1:69:api/src/infrastructure/postgres/guided-sessions-scope.ts
// Misma convención para daily, refinement, review, retro (+ topic)
```

Estos archivos son la **prueba** de que el sistema asume **API = public_id**, **BD interna = id** para FK hijas — cualquier refactor masivo debe preservar esta frontera o cambiar también rutas HTTP.
