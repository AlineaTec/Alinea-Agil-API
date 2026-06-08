import type {
  ProductFeedbackMisroutingCategory,
  ProductFeedbackReviewStatus,
  ProductFeedbackSubmission,
} from "../domain/product-feedback-submission.js"

export type PlatformSubmissionListFilter = {
  submissionType?: ProductFeedbackSubmission["submissionType"]
  status?: ProductFeedbackReviewStatus
  workspacePublicId?: string
  moduleKey?: string
  projectPublicId?: string
  ideaPublicId?: string
  misroutingCategory?: ProductFeedbackMisroutingCategory
  textSearch?: string
  fromInclusive?: Date
  toInclusive?: Date
  limit: number
  offset: number
}

export type SubmissionReviewPatch = {
  status?: ProductFeedbackReviewStatus
  internalTags?: string[]
  internalNotes?: string | null
  misroutingCategory?: ProductFeedbackMisroutingCategory | null
  duplicateOfSubmissionPublicId?: string | null
  ideaPublicId?: string | null
  reviewDisposition?: string | null
  reviewedByPlatformUserId: string | null
  reviewedAt: Date | null
}

export interface ProductFeedbackSubmissionRepository {
  insert(row: ProductFeedbackSubmission): Promise<void>
  findByPublicId(submissionPublicId: string): Promise<ProductFeedbackSubmission | null>
  findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductFeedbackSubmission | null>
  listPlatform(filter: PlatformSubmissionListFilter): Promise<{ rows: ProductFeedbackSubmission[]; total: number }>
  updateReviewAndAssociations(
    submissionPublicId: string,
    patch: SubmissionReviewPatch,
  ): Promise<ProductFeedbackSubmission | null>
}
