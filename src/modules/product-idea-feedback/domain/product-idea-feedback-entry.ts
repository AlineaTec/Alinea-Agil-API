import type { ProductIdeaStatus } from "./product-idea.js"

export const productIdeaReactions = ["interested", "like", "unclear", "raises_questions"] as const
export type ProductIdeaReaction = (typeof productIdeaReactions)[number]

export const productIdeaFeedbackReviewStatuses = [
  "new",
  "in_review",
  "reviewed",
  "actionable",
  "duplicate",
  "out_of_scope",
  "not_product_feedback",
  "misrouted_support",
] as const
export type ProductIdeaFeedbackEntryReviewStatus = (typeof productIdeaFeedbackReviewStatuses)[number]

export const productIdeaSourceSurfaces = [
  "idea_page",
  "capability_modal",
  "whats_new",
  "beta_banner",
  "other",
] as const
export type ProductIdeaSourceSurface = (typeof productIdeaSourceSurfaces)[number]

export type ProductIdeaFeedbackEntry = {
  feedbackPublicId: string
  ideaPublicId: string
  workspacePublicId: string
  projectPublicId: string | null
  userPublicId: string
  /** Nombre al momento del envío (PII mínima en listados admin). */
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
  createdAt: Date
  updatedAt: Date
}

export type ProductIdeaReadModel = {
  ideaPublicId: string
  title: string
  summary: string
  description: string | null
  status: ProductIdeaStatus
  isFeedbackEnabled: boolean
  area: string
}
