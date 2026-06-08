export const productFeedbackSubmissionTypes = [
  "existing_feature_feedback",
  "new_feature_suggestion",
] as const
export type ProductFeedbackSubmissionType = (typeof productFeedbackSubmissionTypes)[number]

/** Estados de triage — contrato `product-feedback-and-suggestions` (v1). */
export const productFeedbackReviewStatuses = [
  "new",
  "in_review",
  "useful",
  "actionable",
  "duplicate",
  "out_of_scope",
  "misrouted_support",
  "bug",
  "discarded",
] as const
export type ProductFeedbackReviewStatus = (typeof productFeedbackReviewStatuses)[number]

export const productFeedbackMisroutingCategories = [
  "billing",
  "access",
  "data_request",
  "usage_help",
  "import",
  "other",
] as const
export type ProductFeedbackMisroutingCategory = (typeof productFeedbackMisroutingCategories)[number]

export type ProductFeedbackSubmission = {
  submissionPublicId: string
  workspacePublicId: string
  userPublicId: string
  submitterDisplayName: string
  submissionType: ProductFeedbackSubmissionType
  title: string | null
  body: string
  ideaPublicId: string | null
  moduleKey: string | null
  route: string
  screenContext: Record<string, unknown> | null
  projectPublicId: string | null
  operationalApproach: string | null
  sourceSurface: string
  reaction: string | null
  status: ProductFeedbackReviewStatus
  internalTags: string[]
  internalNotes: string | null
  misroutingCategory: ProductFeedbackMisroutingCategory | null
  duplicateOfSubmissionPublicId: string | null
  reviewDisposition: string | null
  reviewedByPlatformUserId: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
