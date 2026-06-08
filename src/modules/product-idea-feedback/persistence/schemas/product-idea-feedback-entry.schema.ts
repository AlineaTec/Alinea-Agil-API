import type { ProductIdeaFeedbackEntryReviewStatus, ProductIdeaReaction, ProductIdeaSourceSurface,  } from "../../domain/product-idea-feedback-entry.js"

export interface ProductIdeaFeedbackEntryEntryDocProps {
  feedbackPublicId: string
  ideaPublicId: string
  workspacePublicId: string
  projectPublicId: string | null
  userPublicId: string
  submitterDisplayName: string
  reaction: ProductIdeaReaction
  likedWhat: string
  couldImproveWhat: string
  additionalComment: string | null
  sourceSurface: ProductIdeaSourceSurface
  reviewStatus: ProductIdeaFeedbackEntryReviewStatus
  reviewedByPlatformUserId: string | null
  reviewedAt: Date | null
  internalTags: string[]
  internalNotes: string | null
}
