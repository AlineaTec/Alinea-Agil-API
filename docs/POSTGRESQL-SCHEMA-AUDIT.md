# Auditoría técnica del esquema PostgreSQL (`api/`)

**Fecha de referencia:** junio 2026  
**Fuente de verdad:** `prisma/schema.prisma` + `prisma/migrations/**`  
**Alcance:** radiografía y diagnóstico. **Sin cambios de modelo** en esta fase.

Documentación relacionada: [`POSTGRESQL-MIGRATION-CLOSURE.md`](./POSTGRESQL-MIGRATION-CLOSURE.md), [`POSTGRESQL-SETUP.md`](./POSTGRESQL-SETUP.md), docs por dominio `POSTGRESQL-*.md`.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---------|------:|
| Tablas (`@@map`) | **67** |
| Migraciones SQL | **13** carpetas |
| Columnas `Json` (jsonb) | **42** |
| Campos `*_public_id` / `*PublicId` en schema | **~250** (muchas denormalizadas) |
| Relaciones Prisma con FK | **~128** |
| FK hacia `references: [id]` | **~89** |
| FK hacia `references: [public_id]` | **18** (usuarios, intents, drafts, ideas) |
| `@@index` declarados en Prisma | **94** |
| `@@unique` declarados en Prisma | **30** (+ uniques en `@unique` por campo) |

### Convenciones actuales (intención del diseño)

- **PK interna:** `id` UUID en casi todas las tablas de dominio.
- **Identificador de API:** `public_id` UUID único cuando el recurso se expone fuera de la BD.
- **Tenancy:** casi todo cuelga de `workspace_id` (FK fuerte) + repetición de `workspace_public_id`.
- **Proyecto:** `project_id` + `project_public_id` en tablas bajo proyecto.
- **jsonb:** documentos embebidos heredados de Mongo o payloads flexibles (charter, cierre de sprint, criterios DoR/DoD, auditoría).

### Lectura global (una frase)

El esquema es **coherente con una migración document-oriented → relacional**: integridad fuerte en el eje workspace → project → work_item, pero con **denormalización masiva de `public_id`** y **varios agregados en jsonb** que concentran deuda de normalización e indexación futura.

---

## 2. Archivos revisados

| Área | Archivos |
|------|----------|
| Esquema | `prisma/schema.prisma` (2076 líneas) |
| Migraciones | 13× `prisma/migrations/*/migration.sql` |
| Docs persistencia | `docs/POSTGRESQL-*.md`, `docs/POSTGRESQL-MIGRATION-CLOSURE.md` |
| Infra Prisma | `src/infrastructure/postgres/README.md`, `prisma-client.ts` |
| Repos (muestreo) | `**/persistence/prisma/*.prisma-repository.ts` en identity, workspace, projects, work_items, sprints, guided_*, impediments, billing, platform |
| Validación | `npm run build` (solo lectura de tipos; sin modificar schema) |

**No se modificó:** `schema.prisma`, migraciones, repositorios ni lógica de negocio.

---

## 3. Inventario por dominio

Leyenda columnas: **PK**, **UQ** (uniques notables), **FK** (relaciones Prisma), **JSONB**, **PUB** (campos `*_public_id` además de FKs uuid), **IDX** (índices `@@index`).

### 3.1 Infraestructura

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `infrastructure_connectivity_probe` | Sonda Fase 0 | `id` | `probe_key` | — | — | — | — | Tabla técnica; sin dominio negocio |

### 3.2 Identity y acceso

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `identity_users` | Usuario registrado | `id` | `public_id`, `email_normalized` | → intent (`public_id`) | — | `public_id`, intent, preferred workspace | `source_registration_intent_public_id` | `preferred_active_workspace_public_id` sin FK |
| `identity_auth_sessions` | Sesión Bearer | `id` | `public_id` | → `identity_users.id` | — | `public_id` | `user_id`, `token_hash`, `expires_at` | |
| `identity_password_reset_tokens` | Reset password | `id` | `token_hash` | → user `id` | — | — | `user_id`, `expires_at`, `used_at` | |
| `identity_registration_intents` | Registro onboarding | `id` | `public_id`, `workspace_code` | workspaces | `metadata` | varios provisioned_* | email, expires, provisioned | Provisioned IDs sin FK a user/workspace |
| `identity_verification_challenges` | OTP registro | `id` | `public_id` | → intent `id` | — | intent + reg intent pub | intent_id, email, expires | Duplica `registration_intent_public_id` |

### 3.3 Workspace y organización

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `workspaces` | Tenant | `id` | `public_id`, `slug` | → intent `public_id` | — | `public_id` | `source_registration_intent_public_id` | Hub central; 30+ relaciones salientes |
| `workspace_owner_memberships` | Owner provisioning | `id` | `public_id`, (ws,user) | ws `id`, user `public_id` | — | 3× pub | `user_public_id` | Distinto de `workspace_members` |
| `workspace_members` | Membresía operativa | `id` | `public_id`, (ws,email), (ws,user) | ws `id`, user `public_id` | — | 3× pub | `user_public_id` | Denormaliza email/full_name |
| `workspace_invitations` | Invitaciones | `id` | `public_id`, `token_hash` | ws `id` | — | 4× pub | ws+email, ws+status, expires | `invited_by_user_public_id` sin FK |
| `workspace_licenses` | Asientos 1:1 | `id` | `workspace_id`, `workspace_public_id` | ws `id` | — | 1× pub | — | Sin índices extra (1:1) |
| `work_teams` | Equipos | `id` | `public_id`, (ws,name_norm) | ws `id` | — | 3× pub | `workspace_public_id` | |
| `work_team_memberships` | Miembros equipo | `id` | `public_id` | team `id` | — | 4× pub | team+active, ws+user | Sin FK a `workspaces` (solo vía team) |
| `work_team_project_links` | Equipo↔proyecto | `id` | `public_id`, (team,project) | team, project `id` | — | 4× pub | ws+project_pub | FK fuerte proyecto ✓ |

### 3.4 Projects y work items

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `project_drafts` | Borrador | `id` | `public_id` | ws `id` | charter, assessment, recommendation, trace, materialization | 4× pub | ws+updated_at | `created_by_user_public_id` sin FK; `materialized_project_public_id` blando |
| `projects` | Proyecto runtime | `id` | `public_id`, (ws,pub), (ws,source_draft) | ws, draft `public_id` | `initial_configuration_summary` | 3× pub | — | **Sin `@@index` en Prisma** salvo uniques |
| `work_items` | Backlog unificado | `id` | `public_id`, (ws,proj,pub) | ws, project, parent `id` | assignment_history, acceptance_criteria | 8× pub | parent+sort, kanban col+sort | `kanban_column_public_id` → columnas en jsonb de flow |
| `work_item_comments` | Comentarios | `id` | compuesto + `public_id` | work_item `id` | — | 6× pub | item chronológico | Mucha denormalización scope |
| `work_item_time_entries` | Tiempo | `id` | compuesto + `public_id` | item, user `public_id` | — | 7× pub | 3 índices consulta | |
| `work_activity_notifications` | Notificaciones | `id` | `dedupe_key`, `public_id` | ws, project, recipient `public_id` | `navigation_target` | 8× pub | recipient×2 | |
| `work_item_implicit_follows` | Follows | `id` | (ws,user,item) | ws, user pub, item | — | 3× pub | item+recency | Sin `public_id` en fila |

### 3.5 Scrum / Kanban

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `sprints` | Sprint | `id` | compuesto + `public_id` | ws, project | **closure, review, retrospective** | 4× pub | ws+proj+status | Artefactos ceremonia en jsonb |
| `sprint_assignments` | Sprint↔ítem | `id` | (ws,proj,sprint,item) | ws, project, sprint, item | — | 5× pub | item / sprint order | Sin `public_id` propio |
| `guided_sprint_planning_sessions` | Planning guiado | `id` | `public_id` | ws, project, sprint? | `transcript_after_close` | 7× pub | proj+updated | Índices únicos parciales en **SQL migración** (no en Prisma) |
| `guided_sprint_planning_candidate_items` | Candidatos | `id` | (ws,proj,session,item) | session, work_item | — | 7× pub | — | |
| `guided_sprint_planning_baselines` | Baseline | `id` | `session_id`, pub ids | session, project, sprint? | — | 7× pub | sprint+created | `committed_work_item_public_ids` array sin FK |
| `kanban_flow_configs` | Flujo Kanban 1:1 | `id` | project unique | ws, project | **flow_definition** | 3× pub | — | Columnas viven dentro de jsonb |

### 3.6 Guided sessions (daily, refinement, review, retro)

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX |
|-------|---------|----|----|----|-------|-----|-----|
| `daily_alignment_sessions` | Daily | `id` | (ws,proj,date,slot) | ws, project, sprint? | — | 5× pub | updated |
| `daily_alignment_participant_updates` | Participante daily | `id` | — | session, user `public_id` | suggestion + hints snapshots | 5× pub | — |
| `guided_refinement_sessions` | Refinement | `id` | — | ws, project, sprint? | — | 7× pub | updated |
| `guided_refinement_reviewed_items` | Ítems refinement | `id` | — | session?, work_item | — | 6× pub | lookup compuesto |
| `guided_review_sessions` | Review | `id` | — | ws, project, sprint? | transcript, additive_notes | 6× pub | updated |
| `guided_review_demonstrated_items` | Demo review | `id` | — | session, work_item | — | 6× pub | lookup |
| `guided_review_feedback_entries` | Feedback review | `id` | — | session, author `public_id` | — | 6× pub | session+created |
| `guided_retrospective_sessions` | Retro | `id` | — | ws, project, sprint? | period, transcript, notes, context_hints | 7× pub | updated |
| `guided_retrospective_topics` | Tópicos | `id` | — | session, creator `public_id` | — | 5× pub | session |
| `guided_retrospective_contributions` | Contribuciones | `id` | — | session | — | 6× pub | session |
| `guided_retrospective_votes` | Votos | `id` | — | session, voter `public_id` | — | 6× pub | — |
| `guided_retrospective_action_items` | Acciones retro | `id` | — | session, owner? `public_id` | `history` | 6× pub | session, updated |

Patrón repetido: **sesión** + hijos con `session_id` FK fuerte, pero **5–7 columnas `*_public_id`** redundantes por fila.

### 3.7 Impediments y work controls

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX | Notas |
|-------|---------|----|----|----|-------|-----|-----|-------|
| `project_impediments` | Impedimentos | `id` | `public_id` | ws, project, work_item?, reporter/responsible `public_id` | — | 7× pub | status, updated | `related_sprint_public_id` **sin FK** |
| `project_impediment_comments` | Comentarios imp. | `id` | compuesto | impediment, ws, project, author pub | — | 6× pub | chronological |
| `work_controls_project_profiles` | DoR/DoD proyecto | `id` | (ws,proj,approach) | ws, project | **criteria** + column pub ids | 4× pub | — | Columnas kanban en perfil sin FK a flow |
| `work_controls_workspace_templates` | Plantilla ws | `id` | ws unique | ws | **criteria** | 1× pub | — | 1:1 workspace |
| `work_controls_override_tokens` | Override token | `id` | `public_id` | ws, project, actor pub | — | 5× pub | expires | **`work_item_public_id` sin FK** |
| `work_controls_audit_events` | Audit controls | `id` | `public_id` | **ninguna** | `details` | 4× pub | ws+occurred | Append-only; sin `workspace_id` FK |

### 3.8 Billing, pagos, auditoría operativa

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX |
|-------|---------|----|----|----|-------|-----|-----|
| `billing_workspace_snapshots` | Snapshot billing | `id` | ws 1:1 | ws | — | 1× pub | subscription, status+grace |
| `billing_paddle_webhook_processed_events` | Idempotencia webhook | `event_id` | — | — | — | — | — |
| `billing_notification_sends` | Notif. enviada | `id` | (ws,kind,dedupe) | ws | — | 1× pub | ws+sent |
| `billing_workspace_audit_events` | Audit billing | `id` | — | ws | `payload` | 1× pub | 2× chronológico |
| `payment_workspace_receipts` | Recibos | `id` | receipt_number, provider+txn | ws | — | 2× pub | ws+issued |
| `payment_receipt_year_sequences` | Numeración | `year` | — | — | — | — | — |
| `payment_receipt_orphan_events` | Huérfanos | `id` | — | — | `payload` | — | provider+txn |
| `workspace_audit_events` | Audit backlog/wip | `id` | `public_id` | ws | prev/next value | 5× pub | project+occurred | Recursos solo por `*_public_id` string |
| `project_impediment_audit_events` | Audit impedimentos | `id` | `public_id` | project `id` | payloads | 5× pub | impediment chron |
| `work_team_audit_events` | Audit equipos | `id` | `public_id` | ws | payloads | 4× pub | team chron |

### 3.9 Product feedback, operating snapshot, platform, email

| Tabla | Dominio | PK | UQ | FK | JSONB | PUB | IDX |
|-------|---------|----|----|----|-------|-----|-----|
| `product_ideas` | Catálogo ideas | `id` | `public_id` | — | — | 1× pub | status, area |
| `product_feedback_submissions` | Submissions | `id` | `public_id` | ws, idea?, project? | screen_context | 6× pub | varios filtros |
| `product_idea_feedback_entries` | Feedback idea | `id` | user+idea+ws | idea pub, ws, project? | — | 5× pub | — |
| `product_feedback_audit_events` | Audit submission | `id` | `public_id` | ws | payloads | 4× pub | submission+occurred |
| `product_idea_feedback_audit_events` | Audit idea FB | `id` | `public_id` | ws | payloads | 4× pub | feedback+occurred |
| `project_operating_snapshot_nba_snoozes` | NBA snooze | `id` | user+proj+key | ws, project | — | 4× pub | lookup compuesto |
| `platform_audit_events` | Audit plataforma | `id` | `public_id` | **ninguna** | payloads | 3× pub opcionales | 5× occurred |
| `platform_users` | Admin users | `id` | email, platform_user_id | sessions | — | platform_user_id | — |
| `platform_access_sessions` | Sesión admin | `id` | session_public_id | platform_user | — | 1× pub | token, expires |
| `platform_password_reset_tokens` | Reset admin | `id` | token_hash | platform_user | — | — | user, expires |
| `platform_tenants` | Tenant 1:1 ws | `id` | tenant_id, workspace_pub | **ninguna a workspaces** | — | 2× pub | — |
| `transactional_email_outbound_messages` | Ledger email | `id` | `public_id` | — | — | 1× pub | created, template, to, ok |

---

## 4. Diagnóstico de normalización

Clasificación: **high** = riesgo integridad/consistencia o deuda alta; **medium** = mejora recomendable; **low** = aceptable o cosmético.

### 4.1 Patrones transversales

| Hallazgo | Sev. | Descripción |
|----------|------|-------------|
| **Doble/triple clave de scope** (`workspace_id` + `workspace_public_id` + a veces `project_public_id`) | **medium** | Facilita consultas por API sin join, pero obliga a mantener consistencia en aplicación. Cualquier update de `public_id` (improbable) o bug de escritura rompe reportes. |
| **FK a `identity_users.public_id`** en lugar de `id` | **medium** | Coherente con API, pero índices y joins siempre por UUID expuesto; 18 relaciones. Alternativa futura: FK a `id` + `public_id` solo donde se expone. |
| **Tablas de auditoría sin FK de actor** | **medium** | Muchos `actor_user_public_id` / `actor_platform_user_id` sin integridad referencial. Aceptable para append-only, pero impide cascadas y validación DB. |
| **jsonb como sustituto de tablas hijas** | **high** (selectivo) | Ver §4.3. |

### 4.2 Dominios bien alineados (pocos cambios estructurales urgentes)

| Área | Comentario |
|------|------------|
| `sprint_assignments`, `work_team_project_links` | FK compuestas claras; unicidad por negocio |
| `identity_auth_sessions` → `user_id` | FK interna clásica |
| `workspace_licenses`, `billing_workspace_snapshots` | 1:1 con workspace; normalizado |
| `billing_paddle_webhook_processed_events` | PK natural `event_id` |
| `guided_*` hijos de sesión | `session_id` + unique por ítem donde aplica |

### 4.3 jsonb — candidatos a normalización futura

| Tabla / columna | Sev. | Contenido | Riesgo |
|-----------------|------|-----------|--------|
| `sprints.closure`, `review`, `retrospective` | **high** | Subdocumentos de ceremonia Scrum | Consultas/analytics por ítem de cierre, AC counts, etc. difíciles; no FK entre sprint artifacts |
| `work_items.acceptance_criteria` | **high** | Lista de AC embebida | Histórico por AC, estados, contadores en impedimentos/sprint closure |
| `work_items.assignment_history` | **medium** | Eventos de asignación | Reporting de asignaciones |
| `project_drafts.charter`, `methodology_assessment`, `trace` | **medium** | Wizard flexible | Aceptable como documento si no se consulta por campos internos |
| `kanban_flow_configs.flow_definition` | **high** | Columnas + WIP | `work_items.kanban_column_public_id` referencia IDs dentro del json sin FK |
| `work_controls_*.criteria` | **medium** | Reglas DoR/DoD | Puede quedarse json si el motor de reglas es opaco |
| Tablas `*_audit_*`.payload | **low** | Event sourcing | Normal en auditoría |

### 4.4 Referencias blandas y columnas sin FK (normalización / integridad)

| Ubicación | Sev. | Problema |
|-----------|------|----------|
| `work_items.kanban_column_public_id` | **high** | No referencia fila en `kanban_flow_configs.flow_definition` |
| `project_impediments.related_sprint_public_id` | **medium** | Sprint opcional sin FK |
| `work_controls_override_tokens.work_item_public_id` | **high** | Sin FK a `work_items` |
| `workspace_audit_events.resource_*_public_id` | **medium** | Sin FK a project/work_item |
| `identity_users.preferred_active_workspace_public_id` | **medium** | Sin FK |
| `project_drafts.created_by_user_public_id`, muchos `created_by_*` en guided/baseline | **low–medium** | Solo validación en app |
| `platform_tenants.workspace_public_id` | **medium** | Sin FK a `workspaces.public_id` |
| `product_feedback_audit_events.submission_public_id` | **medium** | Sin FK a submissions |
| `guided_sprint_planning_baselines.committed_work_item_public_ids` | **medium** | Array de UUIDs sin tabla puente |
| `workspace_invitations.invited_by_user_public_id` | **low** | Usuario invitador |

### 4.5 Posible mezcla de responsabilidades

| Tabla | Sev. | Observación |
|-------|------|-------------|
| `workspaces` | **low** | Hub demasiado grande en Prisma (muchas relaciones); en BD es solo tenant — OK |
| `work_items` | **medium** | Mezcla Scrum + Kanban + asignación + AC + métricas (`comments_count`) en una fila |
| `identity_registration_intents` | **low** | FSM + datos de workspace + pago + metadata; aceptable como agregado de proceso |

### 4.6 Nullable y tipos string

| Hallazgo | Sev. |
|----------|------|
| Muchos `String` sin enum Prisma (estado en `daily_alignment`, `guided_*` facilitator ids) | **low** — validación en dominio |
| `modality`, `billing_status` como string en distintas tablas | **low** — consistencia nominal |

---

## 5. Diagnóstico de indexación

### 5.1 Fortalezas

- Índices **compuestos alineados al tenancy**: `(workspace_id, project_id, …)` en work items, comments, guided, impediments.
- **Uniques de negocio** bien planteados: daily/refinement slot por proyecto, sprint assignment, implicit follows, billing dedupe.
- **Índices de lectura cronológica**: comments, time entries, audit events con `occurred_at DESC` o `created_at`.
- **Notificaciones**: índice unread + recipient + workspace.
- **Migración SQL** añade índices únicos **parciales** en `guided_sprint_planning_sessions` (no reflejados en Prisma — ver §5.3).

### 5.2 Huecos y mejoras probables

| Tabla / consulta | Sev. | Observación |
|------------------|------|-------------|
| `projects` | **medium** | Solo `@@unique`; falta índice explícito `(workspace_id, lifecycle_status)` o `(workspace_id, updated_at)` si listados son frecuentes |
| `projects` | **low** | `@@unique([workspace_id, public_id])` redundante si `public_id` ya es global unique |
| `kanban_flow_configs` | **low** | 1:1 project; OK |
| FK `workspace_id` en tablas hijas | **low** | PostgreSQL no indexa FK automáticamente; la mayoría tienen índice compuesto que lo cubre |
| `platform_users` | **medium** | Sin índice en `status` / `role` si listados admin filtran |
| `platform_tenants` | **low** | Búsqueda por `workspace_public_id` cubierta por unique |
| `identity_registration_intents` | **low** | `workspace_code` unique; búsquedas por email cubiertas |
| `work_controls_audit_events` | **medium** | Solo `(workspace_public_id, occurred_at)` — sin `workspace_id`; joins desde workspace requieren public_id |
| `product_feedback_submissions.user_public_id` | **medium** | Sin índice dedicado si hay “mis submissions” por usuario |
| `transactional_email_outbound_messages` | **low** | Índices de soporte/ops OK |

### 5.3 Redundancia y deriva Prisma ↔ SQL

Índices **parciales** presentes en SQL de migraciones (no visibles en `schema.prisma`):

| Migración / tabla | Índice | Condición |
|-------------------|--------|-----------|
| `guided_retrospective_sessions` | `guided_retrospective_sessions_open_session_code_key` | `session_code` NOT NULL y `status` en planned/open/collecting/voting/closing |
| `product_feedback_submissions` | `pf_unique_user_idea_workspace` | `idea_public_id` IS NOT NULL |
| `guided_sprint_planning_sessions` | `sprint_bound_key` / `flow_window_key` | Una sesión por sprint (`sprint_public_id` NOT NULL) o una por ventana fecha+slot sin sprint |
| `workspace_invitations` | `pending_workspace_email_key` | Un invite pending por `(workspace_id, email_normalized)` |
| `work_team_memberships` | `active_team_user_key` | Un miembro activo por `(team_id, user_public_id)` |

| Hallazgo | Sev. |
|----------|------|
| Índices únicos parciales anteriores no modelados en Prisma | **medium** — riesgo de drift si alguien solo usa `prisma migrate` |
| Uniques duplicados scope: `public_id` global + `(workspace_id, project_id, public_id)` en work_items | **low** — espacio extra mínimo |
| `@@index([workspace_public_id])` cuando ya existe `workspace_id` FK | **low** — útil para queries que filtran solo por public_id sin join |

### 5.4 jsonb e indexación

| Columna | Sev. | Nota |
|---------|------|------|
| jsonb en general | **medium** | Sin índices GIN en schema; correcto si no se filtra por claves internas |
| `flow_definition`, `acceptance_criteria` | **high** | Si en el futuro se filtra por estado de AC o columna Kanban, harán falta GIN o normalización |

---

## 6. Referencias blandas y endurecimiento (oportunidades)

Prioridad de endurecimiento = impacto en integridad vs esfuerzo. **No es plan de implementación**, solo hallazgos.

| # | Referencia | Endurecimiento sugerido | Esfuerzo estimado |
|---|------------|-------------------------|-------------------|
| 1 | `kanban_column_public_id` → columnas en `flow_definition` | Tabla `kanban_columns` o FK compuesta `(project_id, column_public_id)` | Alto |
| 2 | `work_controls_override_tokens.work_item_id` | FK a `work_items.id` | Bajo |
| 3 | `project_impediments.sprint_id` | FK opcional a `sprints.id` además de/public_id | Bajo |
| 4 | `platform_tenants` → `workspaces` | FK `workspace_id` o `references: [public_id]` | Medio |
| 5 | Audit tables → actors | FK opcionales a `identity_users` / `platform_users` | Medio (migración datos) |
| 6 | Reducir denormalización `workspace_public_id` | Mantener solo en tablas “frontera” o vistas | Alto (refactor transversal) |
| 7 | `sprints.closure/review/retrospective` | Tablas hijas 1:1 o 1:N | Alto |
| 8 | `acceptance_criteria` embebido | Tabla `work_item_acceptance_criteria` | Alto |

Dependencias solo en código hoy: coherencia `workspace_public_id` con `workspace_id`, orden de `sprint_sort_order`, lectura de columnas Kanban desde json, conteos (`comments_count`) vs filas reales en comments.

---

## 7. Priorización de revisión (siguiente fase de refactor)

Orden sugerido para **diseño de cambios** (no implementados aquí):

| Prioridad | Dominio / tabla | Motivo |
|-----------|-----------------|--------|
| **P0** | `work_items` + `kanban_flow_configs` | Puente Kanban columna↔ítem; jsonb + public_id |
| **P0** | `sprints` (jsonb closure/review/retro) | Ceremonias Scrum y reporting |
| **P1** | `projects` / `project_drafts` | Listados, materialización, índices |
| **P1** | `work_controls_*` + overrides | Integridad work item; criterios |
| **P1** | `project_impediments` | sprint FK, vínculo work_item ya OK |
| **P2** | `guided_*` (12 tablas) | Reducir columnas `*_public_id` redundantes; validar índices parciales en Prisma |
| **P2** | `workspace_audit_events` + audit append-only | FK opcionales vs mantener blando |
| **P3** | `identity_*` / `platform_*` | FK public_id vs id; tenants |
| **P3** | `billing_*`, `payment_*`, `transactional_email_*` | Relativamente sanos; tuning índices |
| **P3** | `product_feedback_*` | FK audit; índice por usuario |

---

## 8. Zonas ambiguas (requieren decisión de producto antes de refactor)

1. **`public_id` como FK vs solo `id` interno:** el schema mezcla ambos. Decidir si el estándar futuro es FK siempre a `id` y `public_id` solo unique para API.
2. **¿Normalizar ceremonias Scrum o mantener jsonb?** Impacta review/retro modules y export PDF/reportes.
3. **Criterios de aceptación:** ¿siguen siendo documento embebido o entidad con ciclo de vida propio?
4. **Tablas audit sin FK:** ¿se quiere integridad estricta o inmutabilidad desacoplada?
5. **Índices parciales en SQL no en Prisma:** reconciliar fuente de verdad antes de próxima migración.

---

## 9. Validación realizada

```bash
cd api && npm run build   # OK — sin cambios en schema ni código de producción
```

No se ejecutaron migraciones ni tests de integración (no aportan a inventario estático).

---

## 10. Confirmación de alcance

- [x] Inventario de **67** tablas por dominio  
- [x] Diagnóstico de normalización con severidad  
- [x] Diagnóstico de indexación  
- [x] Sección de referencias blandas  
- [x] Priorización P0–P3  
- [x] **Cero** cambios en `schema.prisma`, migraciones o repositorios  

---

## Apéndice A — Enumeración de tablas (orden alfabético)

`billing_notification_sends`, `billing_paddle_webhook_processed_events`, `billing_workspace_audit_events`, `billing_workspace_snapshots`, `daily_alignment_participant_updates`, `daily_alignment_sessions`, `guided_refinement_reviewed_items`, `guided_refinement_sessions`, `guided_retrospective_action_items`, `guided_retrospective_contributions`, `guided_retrospective_sessions`, `guided_retrospective_topics`, `guided_retrospective_votes`, `guided_review_demonstrated_items`, `guided_review_feedback_entries`, `guided_review_sessions`, `guided_sprint_planning_baselines`, `guided_sprint_planning_candidate_items`, `guided_sprint_planning_sessions`, `identity_auth_sessions`, `identity_password_reset_tokens`, `identity_registration_intents`, `identity_users`, `identity_verification_challenges`, `infrastructure_connectivity_probe`, `kanban_flow_configs`, `payment_receipt_orphan_events`, `payment_receipt_year_sequences`, `payment_workspace_receipts`, `platform_access_sessions`, `platform_audit_events`, `platform_password_reset_tokens`, `platform_tenants`, `platform_users`, `product_feedback_audit_events`, `product_feedback_submissions`, `product_idea_feedback_audit_events`, `product_idea_feedback_entries`, `product_ideas`, `project_drafts`, `project_impediment_audit_events`, `project_impediment_comments`, `project_impediments`, `project_operating_snapshot_nba_snoozes`, `projects`, `sprint_assignments`, `sprints`, `transactional_email_outbound_messages`, `work_activity_notifications`, `work_controls_override_tokens`, `work_controls_audit_events`, `work_controls_project_profiles`, `work_controls_workspace_templates`, `work_item_comments`, `work_item_implicit_follows`, `work_item_time_entries`, `work_items`, `work_team_audit_events`, `work_team_memberships`, `work_team_project_links`, `work_teams`, `workspace_audit_events`, `workspace_invitations`, `workspace_licenses`, `workspace_members`, `workspace_owner_memberships`, `workspaces`.

## Apéndice B — FK hacia `public_id` (lista completa)

Relaciones Prisma con `references: [public_id]`:

- `identity_users` → `identity_registration_intents`
- `workspaces` → `identity_registration_intents`
- `workspace_owner_memberships`, `workspace_members` → `identity_users`
- `projects` → `project_drafts`
- `work_item_time_entries`, `work_activity_notifications`, `work_item_implicit_follows` → `identity_users`
- `daily_alignment_participant_updates` → `identity_users`
- `guided_review_feedback_entries`, `guided_retrospective_*` (topic, vote, action owner) → `identity_users`
- `project_impediments` (reporter, responsible), `project_impediment_comments` → `identity_users`
- `work_control_override_tokens` → `identity_users`
- `product_feedback_submissions`, `product_idea_feedback_entries` → `product_ideas`

Todas las demás relaciones usan `references: [id]` o claves naturales (`platform_user_id`, `event_id`, `year`).
