import {
  CAPACITY_CONCERNS,
  EXCLUDED_REASONS,
  type GuidedSprintPlanningCandidateItemState,
} from "../../domain/guided-sprint-planning-candidate-item.js"

export interface GuidedSprintPlanningCandidateItemDocProps {
  candidateItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  workItemPublicId: string
  isReadyForPlanning: boolean
  isCommitted: boolean
  isExcluded: boolean
  excludedReason: (typeof EXCLUDED_REASONS)[number] | null
  excludedReasonNotes: string | null
  riskNotes: string | null
  dependencyNotes: string | null
  capacityConcern: (typeof CAPACITY_CONCERNS)[number]
  planningDecisionNotes: string | null
  commitmentDecisionByUserPublicIds: string[]
  createdAt: Date
  updatedAt: Date
}

export type { GuidedSprintPlanningCandidateItemState }
