import type { GuidedReviewSessionState,  } from "../../domain/guided-review-session.js"

export type GuidedReviewSessionDocProps = Omit<GuidedReviewSessionState, "createdAt" | "updatedAt"> & {
  createdAt: Date
  updatedAt: Date
}
