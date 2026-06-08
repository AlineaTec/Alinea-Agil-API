import type { ProductFeedbackReviewStatus, ProductFeedbackSubmissionType,  } from "../../domain/product-feedback-submission.js"
import {  } from "../../domain/product-feedback-submission.js"

export interface ProductFeedbackSubmissionDocProps {
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
  misroutingCategory: string | null
  duplicateOfSubmissionPublicId: string | null
  reviewDisposition: string | null
  reviewedByPlatformUserId: string | null
  reviewedAt: Date | null
}
