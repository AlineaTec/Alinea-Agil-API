import type { AcceptanceCriterionStatus } from "./acceptance-criterion-status.js"

export type AcceptanceCriterionState = {
  acceptanceCriterionPublicId: string
  text: string
  status: AcceptanceCriterionStatus
  createdAt: Date
  updatedAt: Date
}

export type AcceptanceCriteriaSummaryJson = {
  totalCriteriaCount: number
  pendingCriteriaCount: number
  doneCriteriaCount: number
  reviewedCriteriaCount: number
}

export function acceptanceCriteriaSummary(
  criteria: readonly AcceptanceCriterionState[],
): AcceptanceCriteriaSummaryJson {
  const summary: AcceptanceCriteriaSummaryJson = {
    totalCriteriaCount: criteria.length,
    pendingCriteriaCount: 0,
    doneCriteriaCount: 0,
    reviewedCriteriaCount: 0,
  }
  for (const c of criteria) {
    if (c.status === "pending") summary.pendingCriteriaCount += 1
    else if (c.status === "done") summary.doneCriteriaCount += 1
    else summary.reviewedCriteriaCount += 1
  }
  return summary
}
