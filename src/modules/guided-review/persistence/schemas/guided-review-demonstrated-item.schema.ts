import type { GuidedReviewDemonstratedItemState } from "../../domain/guided-review-demonstrated-item.js"

export type GuidedReviewDemonstratedItemDocProps = Omit<GuidedReviewDemonstratedItemState, "createdAt" | "updatedAt"> & {
  createdAt: Date
  updatedAt: Date
}
