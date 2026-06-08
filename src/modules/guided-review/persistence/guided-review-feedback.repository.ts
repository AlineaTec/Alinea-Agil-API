import type { GuidedReviewFeedbackState } from "../domain/guided-review-feedback.js"

export type GuidedReviewFeedbackRepository = {
  insert(state: GuidedReviewFeedbackState): Promise<void>
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedReviewFeedbackState[]>
}
