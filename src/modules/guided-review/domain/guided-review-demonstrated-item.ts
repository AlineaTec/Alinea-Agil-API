export type GuidedReviewDemonstrationStatus =
  | "not_demonstrated"
  | "demonstrated"
  | "demonstrated_partial"
  | "demonstrated_with_observations"
  | "skipped"

export type GuidedReviewItemOutcome =
  | "no_major_issues"
  | "observations_recorded"
  | "follow_up_required"
  | "backlog_or_priority_impact"
  | "needs_external_validation"

export type GuidedReviewDemonstratedItemState = {
  demonstratedItemPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  workItemPublicId: string
  demonstrationStatus: GuidedReviewDemonstrationStatus
  demonstratedByUserPublicIds: string[]
  demoNotes: string | null
  stakeholderFeedbackSummary: string | null
  questionsRaised: string[]
  followUpRequired: boolean
  backlogImpactSuggested: boolean
  priorityImpactSuggested: boolean
  requiresFurtherValidation: boolean
  reviewOutcome: GuidedReviewItemOutcome | null
  createdAt: Date
  updatedAt: Date
}
