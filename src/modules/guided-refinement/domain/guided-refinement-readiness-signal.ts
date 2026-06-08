export type GuidedReadinessSignalKind =
  | "missing_acceptance_criteria"
  | "estimation_recommended"
  | "open_dependency"
  | "size_concern"
  | "insufficient_clarity"
  | "consensus_pending"
  | "ready_for_planning"
  | "ready_with_observations"

export type GuidedReadinessSignalStatus = "suggested" | "acknowledged" | "not_applicable"

export type GuidedReadinessSignalDto = {
  kind: GuidedReadinessSignalKind
  status: GuidedReadinessSignalStatus
  explanation: string
  /** v1: señales nunca bloquean guardado; reservado para evolución. */
  isBlocking: boolean
  /** Orientación / conversación, no enforcement. */
  isGuidanceOnly: boolean
}
