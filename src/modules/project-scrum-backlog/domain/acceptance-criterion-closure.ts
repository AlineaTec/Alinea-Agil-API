import type { AcceptanceCriteriaSummaryJson } from "./acceptance-criterion.js"

/** Resumen congelado en el snapshot de cierre (nombres alineados a persistencia). */
export type AcceptanceCriteriaFrozenCounts = {
  acceptanceCriteriaTotalCount: number
  acceptanceCriteriaPendingCount: number
  acceptanceCriteriaDoneCount: number
  acceptanceCriteriaReviewedCount: number
}

export function acceptanceCriteriaSummaryFromFrozen(
  row: AcceptanceCriteriaFrozenCounts,
): AcceptanceCriteriaSummaryJson {
  return {
    totalCriteriaCount: row.acceptanceCriteriaTotalCount,
    pendingCriteriaCount: row.acceptanceCriteriaPendingCount,
    doneCriteriaCount: row.acceptanceCriteriaDoneCount,
    reviewedCriteriaCount: row.acceptanceCriteriaReviewedCount,
  }
}
