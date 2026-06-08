import type {
  ProductIdeaFeedbackEntry,
  ProductIdeaFeedbackEntryReviewStatus,
} from "../domain/product-idea-feedback-entry.js"

export type AdminListFilter = {
  reviewStatus?: ProductIdeaFeedbackEntryReviewStatus
  ideaPublicId?: string
  workspacePublicId?: string
  fromInclusive?: Date
  toInclusive?: Date
  limit: number
  offset: number
}

export type ReviewMetadataPatch = {
  reviewStatus?: ProductIdeaFeedbackEntryReviewStatus
  internalTags?: string[]
  internalNotes?: string | null
  reviewedByPlatformUserId: string | null
  reviewedAt: Date | null
}

export interface ProductIdeaFeedbackEntryEntryRepository {
  insert(row: ProductIdeaFeedbackEntry): Promise<void>
  findByPublicId(feedbackPublicId: string): Promise<ProductIdeaFeedbackEntry | null>
  findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductIdeaFeedbackEntry | null>
  listAdmin(filter: AdminListFilter): Promise<{ rows: ProductIdeaFeedbackEntry[]; total: number }>
  updateReviewMetadata(feedbackPublicId: string, patch: ReviewMetadataPatch): Promise<ProductIdeaFeedbackEntry | null>
}
