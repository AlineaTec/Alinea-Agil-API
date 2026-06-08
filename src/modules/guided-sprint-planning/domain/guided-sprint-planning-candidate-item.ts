export const EXCLUDED_REASONS = [
  "not_ready_for_planning",
  "capacity",
  "dependency",
  "too_large",
  "priority",
  "risk",
  "deferred_by_po",
  "team_declined",
  "other",
] as const

export type ExcludedReason = (typeof EXCLUDED_REASONS)[number]

export const CAPACITY_CONCERNS = ["none", "mild", "significant"] as const

export type CapacityConcern = (typeof CAPACITY_CONCERNS)[number]

export type GuidedSprintPlanningCandidateItemState = {
  candidateItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  workItemPublicId: string
  isReadyForPlanning: boolean
  isCommitted: boolean
  isExcluded: boolean
  excludedReason: ExcludedReason | null
  excludedReasonNotes: string | null
  riskNotes: string | null
  dependencyNotes: string | null
  capacityConcern: CapacityConcern
  planningDecisionNotes: string | null
  commitmentDecisionByUserPublicIds: string[]
  createdAt: Date
  updatedAt: Date
}
