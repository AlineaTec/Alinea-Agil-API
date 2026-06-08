export type GuidedReviewFeedbackSourceType =
  | "stakeholder"
  | "product_owner"
  | "team"
  | "facilitator"
  | "other"

export type GuidedReviewFeedbackCategory =
  | "value_and_outcome"
  | "usability_and_experience"
  | "scope_and_clarity"
  | "quality_and_risk"
  | "sprint_goal_alignment"
  | "process_and_facilitation"
  | "other"

export type GuidedReviewFeedbackState = {
  feedbackEntryPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sourceType: GuidedReviewFeedbackSourceType
  stakeholderDisplayName: string | null
  feedbackText: string
  feedbackCategory: GuidedReviewFeedbackCategory
  affectsWorkItemPublicIds: string[]
  /** Derivable: affectsWorkItemPublicIds.length === 0 (OQ-GREV-8). */
  isGeneralFeedback: boolean
  suggestedBacklogAction: string | null
  suggestedPriorityImpact: string | null
  marksFollowUp: boolean
  marksBacklogImpact: boolean
  marksPriorityImpact: boolean
  createdByUserPublicId: string
  createdAt: Date
}
