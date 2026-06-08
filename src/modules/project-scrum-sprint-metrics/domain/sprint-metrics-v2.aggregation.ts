import type { SprintClosureSnapshotItem } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import { SprintMetricsValidationError } from "./sprint-metrics.errors.js"

/** Agregados Sprint Metrics v2 (derivados solo del snapshot congelado). */
export type SprintMetricsV2Computed = {
  metricsSchemaVersion: 2
  committedStoryPoints: number
  completedStoryPoints: number
  notCompletedStoryPoints: number
  completionPercentageByStoryPoints: number | null
  estimatedCommittedItemsCount: number
  unestimatedCommittedItemsCount: number
  itemsWithPendingAcceptanceCriteriaCount: number
  itemsWithNotFullyReviewedAcceptanceCriteriaCount: number
  carryoverItemsCount: number
  carryoverStoryPoints: number
}

function assertNonNegativeInt(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SprintMetricsValidationError(`Closure snapshot has invalid ${label} (expected non-negative integer).`)
  }
}

/**
 * Exige que cada fila del snapshot incluya campos congelados en el cierre (post–Sprint Metrics v2).
 * Cierres legacy sin estos campos no son elegibles para métricas v2.
 */
export function assertFrozenClosureSnapshotCompleteForV2(items: readonly SprintClosureSnapshotItem[]): void {
  for (const row of items) {
    if (row.storyPointsAtClosure === undefined) {
      throw new SprintMetricsValidationError(
        "Closure snapshot is missing frozen story points (storyPointsAtClosure). This sprint was likely closed before Sprint Metrics v2.",
      )
    }
    if (row.storyPointsAtClosure !== null) {
      assertNonNegativeInt(row.storyPointsAtClosure, "storyPointsAtClosure")
    }
    const acFields = [
      ["acceptanceCriteriaTotalCount", row.acceptanceCriteriaTotalCount],
      ["acceptanceCriteriaPendingCount", row.acceptanceCriteriaPendingCount],
      ["acceptanceCriteriaDoneCount", row.acceptanceCriteriaDoneCount],
      ["acceptanceCriteriaReviewedCount", row.acceptanceCriteriaReviewedCount],
    ] as const
    for (const [name, v] of acFields) {
      if (v === undefined) {
        throw new SprintMetricsValidationError(
          `Closure snapshot is missing frozen acceptance criteria field (${name}). This sprint was likely closed before Sprint Metrics v2.`,
        )
      }
      assertNonNegativeInt(v, name)
    }
    const t = row.acceptanceCriteriaTotalCount!
    const sum =
      row.acceptanceCriteriaPendingCount! +
      row.acceptanceCriteriaDoneCount! +
      row.acceptanceCriteriaReviewedCount!
    if (t !== sum) {
      throw new SprintMetricsValidationError(
        "Closure snapshot has inconsistent acceptance criteria counts (total does not equal pending + done + reviewed).",
      )
    }
  }
}

/** Calcula agregados v2; llamar solo tras `assertFrozenClosureSnapshotCompleteForV2`. */
export function computeSprintMetricsV2FromFrozenItems(
  items: readonly SprintClosureSnapshotItem[],
): SprintMetricsV2Computed {
  let committedStoryPoints = 0
  let completedStoryPoints = 0
  let notCompletedStoryPoints = 0
  let estimatedCommittedItemsCount = 0
  let unestimatedCommittedItemsCount = 0
  let itemsWithPendingAcceptanceCriteriaCount = 0
  let itemsWithNotFullyReviewedAcceptanceCriteriaCount = 0
  let carryoverItemsCount = 0
  let carryoverStoryPoints = 0

  for (const row of items) {
    const pts = row.storyPointsAtClosure
    if (pts !== null && pts !== undefined) {
      estimatedCommittedItemsCount += 1
      committedStoryPoints += pts
      if (row.outcome === "completed") {
        completedStoryPoints += pts
      } else {
        notCompletedStoryPoints += pts
      }
    } else {
      unestimatedCommittedItemsCount += 1
    }

    const pending = row.acceptanceCriteriaPendingCount!
    const total = row.acceptanceCriteriaTotalCount!
    const reviewed = row.acceptanceCriteriaReviewedCount!
    if (pending > 0) {
      itemsWithPendingAcceptanceCriteriaCount += 1
    }
    if (total > 0 && reviewed < total) {
      itemsWithNotFullyReviewedAcceptanceCriteriaCount += 1
    }

    if (row.outcome === "not_completed") {
      carryoverItemsCount += 1
      if (pts !== null && pts !== undefined) {
        carryoverStoryPoints += pts
      }
    }
  }

  const completionPercentageByStoryPoints =
    committedStoryPoints > 0 ? Math.round((completedStoryPoints / committedStoryPoints) * 100) : null

  if (completedStoryPoints + notCompletedStoryPoints !== committedStoryPoints) {
    throw new SprintMetricsValidationError("Story point aggregates do not reconcile with closure snapshot.")
  }

  return {
    metricsSchemaVersion: 2,
    committedStoryPoints,
    completedStoryPoints,
    notCompletedStoryPoints,
    completionPercentageByStoryPoints,
    estimatedCommittedItemsCount,
    unestimatedCommittedItemsCount,
    itemsWithPendingAcceptanceCriteriaCount,
    itemsWithNotFullyReviewedAcceptanceCriteriaCount,
    carryoverItemsCount,
    carryoverStoryPoints,
  }
}
