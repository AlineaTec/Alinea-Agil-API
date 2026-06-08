export const PROJECT_DRAFT_TRACE_EVENT_TYPES = [
  "draft_created",
  "charter_updated",
  "assessment_updated",
  "recommendation_recorded",
  "decision_recorded",
  "materialization_started",
  "materialization_completed",
  "materialization_failed",
  "not_ready_completed",
] as const

export type ProjectDraftTraceEventType = (typeof PROJECT_DRAFT_TRACE_EVENT_TYPES)[number]

export type TraceEvent = {
  type: ProjectDraftTraceEventType
  at: Date
  actorUserPublicId?: string
  payload?: Record<string, unknown>
}
