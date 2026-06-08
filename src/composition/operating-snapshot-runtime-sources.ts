import type { DailyAlignmentSessionRepository } from "../modules/daily-alignment/persistence/daily-alignment-session.repository.js"
import type { GuidedSprintPlanningSessionRepository } from "../modules/guided-sprint-planning/persistence/guided-sprint-planning-session.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../modules/guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementSessionRepository } from "../modules/guided-refinement/persistence/guided-refinement-session.repository.js"
import type { GuidedReviewSessionRepository } from "../modules/guided-review/persistence/guided-review-session.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../modules/guided-retrospective/persistence/guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "../modules/guided-retrospective/persistence/guided-retrospective-session.repository.js"
import type { ImpedimentRepository } from "../modules/project-impediments/persistence/impediment.repository.js"
import type { ScrumSprintPlanningRepository } from "../modules/project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { RuntimePersistence } from "./runtime-persistence.js"

/**
 * Repositorios de dominios fuente del operating snapshot (sin NBA snooze).
 * Se resuelven desde `RuntimePersistence` para respetar el driver activo por dominio.
 */
export type OperatingSnapshotRuntimeSources = {
  sprintPlanning: ScrumSprintPlanningRepository
  planningSession: GuidedSprintPlanningSessionRepository
  refinementSession: GuidedRefinementSessionRepository
  refinementReviewedItem: GuidedRefinementReviewedItemRepository
  dailySession: DailyAlignmentSessionRepository
  reviewSession: GuidedReviewSessionRepository
  retroSession: GuidedRetrospectiveSessionRepository
  retroActionItem: GuidedRetrospectiveActionItemRepository
  impediments: ImpedimentRepository
}

export function operatingSnapshotRuntimeSourcesFrom(
  runtime: RuntimePersistence,
): OperatingSnapshotRuntimeSources {
  return {
    sprintPlanning: runtime.scrum.sprintPlanning,
    planningSession: runtime.scrum.guidedSession,
    refinementSession: runtime.guidedSessions.refinementSession,
    refinementReviewedItem: runtime.guidedSessions.refinementReviewedItem,
    dailySession: runtime.guidedSessions.dailySession,
    reviewSession: runtime.guidedSessions.reviewSession,
    retroSession: runtime.guidedSessions.retroSession,
    retroActionItem: runtime.guidedSessions.retroActionItem,
    impediments: runtime.impediments.impediments,
  }
}
