# PostgreSQL — dominio guided sessions (Fase 5)

Esquema y repositorios Prisma de daily, refinement, review y retrospective guiados. **PostgreSQL es la persistencia activa** del runtime HTTP.

## Tablas en PostgreSQL

| Tabla Postgres | Nombre legacy (migración) | Ritual |
|----------------|-----------------|--------|
| `daily_alignment_sessions` | `daily_alignment_sessions` | Daily |
| `daily_alignment_participant_updates` | `daily_alignment_participant_updates` | Daily |
| `guided_refinement_sessions` | `guided_refinement_sessions` | Refinement |
| `guided_refinement_reviewed_items` | `guided_refinement_reviewed_items` | Refinement |
| `guided_review_sessions` | `guided_review_sessions` | Review |
| `guided_review_demonstrated_items` | `guided_review_demonstrated_items` | Review |
| `guided_review_feedback_entries` | `guided_review_feedback_entries` | Review |
| `guided_retrospective_sessions` | `guided_retrospective_sessions` | Retrospective |
| `guided_retrospective_topics` | `guided_retrospective_topics` | Retrospective |
| `guided_retrospective_contributions` | `guided_retrospective_contributions` | Retrospective |
| `guided_retrospective_votes` | `guided_retrospective_votes` | Retrospective |
| `guided_retrospective_action_items` | `guided_retrospective_action_items` | Retrospective |

Migración: `prisma/migrations/20250609120000_guided_sessions_domain/`

### Unicidad de sesión

Índice único en las cuatro tablas de sesión:

`(workspace_id, project_id, session_date, session_slot)`

Índice único por `workspacePublicId`, `projectPublicId`, `sessionDate`, `sessionSlot` (además de FK `project_id`).

**Retrospective adicional:** índice parcial único `(workspace_id, session_code)` cuando `session_code` no es null y `status` ∈ `planned|open|collecting|voting|closing`.

### Review feedback (columnas explícitas)

- `source_type`, `stakeholder_display_name`, `body` (dominio: `feedbackText`), `feedback_category`
- `follow_up_required`, `backlog_impact_suggested`, `priority_impact_suggested` (dominio: `marksFollowUp`, etc.)
- `created_by_user_public_id` → FK `identity_users.public_id`

### Refinement reviewed items (columnas explícitas)

- `review_status`, `ready_for_planning`, `ready_with_observations`, notas/razones, `estimation_status`, `size_concern`, `not_ready_reasons`, etc.
- `jsonb` solo en snapshots auxiliares cuando aplica en daily (`suggestion_basis_snapshot`, `consistency_hints_snapshot`)

### jsonb justificado

- Sesiones: `agreements`, `follow_ups`, `additive_notes_after_close`, `transcript_after_close`, `context_hints` (retro), `retrospective_period`
- Action items: `history`

## Repositorios Prisma (no conectados al HTTP)

| Repositorio | Ubicación |
|-------------|-----------|
| `DailyAlignmentSessionPrismaRepository` | `daily-alignment/persistence/prisma/` |
| `DailyAlignmentParticipantUpdatePrismaRepository` | `daily-alignment/persistence/prisma/` |
| `GuidedRefinementSessionPrismaRepository` | `guided-refinement/persistence/prisma/` |
| `GuidedRefinementReviewedItemPrismaRepository` | `guided-refinement/persistence/prisma/` |
| `GuidedReviewSessionPrismaRepository` | `guided-review/persistence/prisma/` |
| `GuidedReviewDemonstratedItemPrismaRepository` | `guided-review/persistence/prisma/` |
| `GuidedReviewFeedbackPrismaRepository` | `guided-review/persistence/prisma/` |
| `GuidedRetrospectiveSessionPrismaRepository` | `guided-retrospective/persistence/prisma/` |
| `GuidedRetrospectiveTopicPrismaRepository` | `guided-retrospective/persistence/prisma/` |
| `GuidedRetrospectiveContributionPrismaRepository` | `guided-retrospective/persistence/prisma/` |
| `GuidedRetrospectiveVotePrismaRepository` | `guided-retrospective/persistence/prisma/` |
| `GuidedRetrospectiveActionItemPrismaRepository` | `guided-retrospective/persistence/prisma/` |

Helpers: `guided-sessions-scope.ts` (`resolveDailyAlignmentSessionId`, `resolveGuidedRefinementSessionId`, `resolveGuidedReviewSessionId`, `resolveGuidedRetrospectiveSessionId`, `resolveGuidedRetrospectiveTopicId`).

## Tests

```bash
cd api
npm run test:postgres:guided-sessions
npm run test:postgres    # incluye Fase 5
```

Archivo: `src/test/postgres/guided-sessions-domain.integration.test.ts`

## Fuera de alcance (esta fase)

Impediments, billing, feedback de producto, audit, snapshot/NBA, conmutación de factories HTTP.
