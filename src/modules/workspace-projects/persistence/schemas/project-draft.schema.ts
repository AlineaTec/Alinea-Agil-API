import { MANAGEMENT_APPROACHES } from "../../domain/management-approach.js"
import { MATERIALIZATION_STATUSES } from "../../domain/project-draft-materialization.js"
import { PROJECT_DRAFT_STATUSES } from "../../domain/project-draft-status.js"

export interface ProjectDraftDocProps {
  draftPublicId: string
  workspacePublicId: string
  createdByUserPublicId: string
  status: (typeof PROJECT_DRAFT_STATUSES)[number]
  projectName: string
  charter: Record<string, unknown>
  methodologyAssessment: Record<string, unknown>
  recommendationResult: Record<string, unknown> | null
  selectedApproach: (typeof MANAGEMENT_APPROACHES)[number] | null
  wasRecommendationOverridden: boolean | null
  overrideJustification: string | null
  materializedProjectPublicId: string | null
  trace: Array<{
    type: string
    at: Date
    actorUserPublicId?: string
    payload?: Record<string, unknown>
  }>
  materialization: {
    status: (typeof MATERIALIZATION_STATUSES)[number]
    materializedProjectPublicId: string | null
    lastError?: string
    attemptedAt?: Date
    completedAt?: Date
  }
  createdAt: Date
  updatedAt: Date
}
