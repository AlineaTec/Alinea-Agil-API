/**
 * Estados del ciclo de vida del project draft.
 * Fuente: contracts-docs …/draft-model-and-state-machine.md
 */
export const PROJECT_DRAFT_STATUSES = [
  "definition_in_progress",
  "ready_for_assessment",
  "assessment_in_progress",
  "ready_for_recommendation",
  "recommended",
  "decision_recorded",
  "materialized",
  "not_ready_complete",
] as const

export type ProjectDraftStatus = (typeof PROJECT_DRAFT_STATUSES)[number]

export const PROJECT_DRAFT_TERMINAL_STATUSES: ReadonlySet<ProjectDraftStatus> = new Set([
  "materialized",
  "not_ready_complete",
])
