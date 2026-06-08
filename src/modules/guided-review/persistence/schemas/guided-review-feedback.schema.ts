import type { GuidedReviewFeedbackState } from "../../domain/guided-review-feedback.js"

export type GuidedReviewFeedbackDocProps = Omit<GuidedReviewFeedbackState, "createdAt"> & {
  createdAt: Date
}
