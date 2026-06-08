import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SprintClosureSnapshotItem } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import {
  assertFrozenClosureSnapshotCompleteForV2,
  computeSprintMetricsV2FromFrozenItems,
} from "./sprint-metrics-v2.aggregation.js"
import { SprintMetricsValidationError } from "./sprint-metrics.errors.js"

function frozenRow(
  overrides: Partial<SprintClosureSnapshotItem> &
    Pick<
      SprintClosureSnapshotItem,
      | "backlogItemPublicId"
      | "finalBoardColumn"
      | "outcome"
      | "storyPointsAtClosure"
      | "acceptanceCriteriaTotalCount"
      | "acceptanceCriteriaPendingCount"
      | "acceptanceCriteriaDoneCount"
      | "acceptanceCriteriaReviewedCount"
    >,
): SprintClosureSnapshotItem {
  return {
    itemType: "user_story",
    title: "T",
    backlogStatusAtClosure: "in_progress",
    sprintSortOrder: 0,
    ...overrides,
  }
}

describe("assertFrozenClosureSnapshotCompleteForV2", () => {
  it("rejects legacy rows without storyPointsAtClosure", () => {
    const row: SprintClosureSnapshotItem = {
      backlogItemPublicId: "a",
      itemType: "user_story",
      title: "t",
      finalBoardColumn: "done",
      outcome: "completed",
      backlogStatusAtClosure: "done",
      sprintSortOrder: 0,
      acceptanceCriteriaTotalCount: 0,
      acceptanceCriteriaPendingCount: 0,
      acceptanceCriteriaDoneCount: 0,
      acceptanceCriteriaReviewedCount: 0,
    }
    assert.throws(
      () => assertFrozenClosureSnapshotCompleteForV2([row]),
      (e: unknown) => e instanceof SprintMetricsValidationError,
    )
  })

  it("rejects inconsistent acceptance criteria totals", () => {
    assert.throws(
      () =>
        assertFrozenClosureSnapshotCompleteForV2([
          frozenRow({
            backlogItemPublicId: "a",
            finalBoardColumn: "done",
            outcome: "completed",
            storyPointsAtClosure: 1,
            acceptanceCriteriaTotalCount: 2,
            acceptanceCriteriaPendingCount: 1,
            acceptanceCriteriaDoneCount: 0,
            acceptanceCriteriaReviewedCount: 0,
          }),
        ]),
      (e: unknown) => e instanceof SprintMetricsValidationError,
    )
  })
})

describe("computeSprintMetricsV2FromFrozenItems", () => {
  it("aggregates story points for mixed estimated / unestimated", () => {
    const items = [
      frozenRow({
        backlogItemPublicId: "1",
        finalBoardColumn: "done",
        outcome: "completed",
        storyPointsAtClosure: 5,
        acceptanceCriteriaTotalCount: 1,
        acceptanceCriteriaPendingCount: 0,
        acceptanceCriteriaDoneCount: 0,
        acceptanceCriteriaReviewedCount: 1,
      }),
      {
        ...frozenRow({
          backlogItemPublicId: "2",
          finalBoardColumn: "to_do",
          outcome: "not_completed",
          storyPointsAtClosure: 3,
          acceptanceCriteriaTotalCount: 0,
          acceptanceCriteriaPendingCount: 0,
          acceptanceCriteriaDoneCount: 0,
          acceptanceCriteriaReviewedCount: 0,
        }),
        itemType: "task",
      },
      frozenRow({
        backlogItemPublicId: "3",
        finalBoardColumn: "to_do",
        outcome: "not_completed",
        storyPointsAtClosure: null,
        acceptanceCriteriaTotalCount: 0,
        acceptanceCriteriaPendingCount: 0,
        acceptanceCriteriaDoneCount: 0,
        acceptanceCriteriaReviewedCount: 0,
      }),
    ]
    assertFrozenClosureSnapshotCompleteForV2(items)
    const m = computeSprintMetricsV2FromFrozenItems(items)
    assert.equal(m.metricsSchemaVersion, 2)
    assert.equal(m.committedStoryPoints, 8)
    assert.equal(m.completedStoryPoints, 5)
    assert.equal(m.notCompletedStoryPoints, 3)
    assert.equal(m.estimatedCommittedItemsCount, 2)
    assert.equal(m.unestimatedCommittedItemsCount, 1)
    assert.equal(m.carryoverItemsCount, 2)
    assert.equal(m.carryoverStoryPoints, 3)
    assert.equal(m.completionPercentageByStoryPoints, 63)
  })

  it("sets completionPercentageByStoryPoints to null when no committed story points", () => {
    const items = [
      frozenRow({
        backlogItemPublicId: "1",
        finalBoardColumn: "done",
        outcome: "completed",
        storyPointsAtClosure: null,
        acceptanceCriteriaTotalCount: 0,
        acceptanceCriteriaPendingCount: 0,
        acceptanceCriteriaDoneCount: 0,
        acceptanceCriteriaReviewedCount: 0,
      }),
    ]
    assertFrozenClosureSnapshotCompleteForV2(items)
    const m = computeSprintMetricsV2FromFrozenItems(items)
    assert.equal(m.committedStoryPoints, 0)
    assert.equal(m.completionPercentageByStoryPoints, null)
  })

  it("counts acceptance criteria signals", () => {
    const items = [
      frozenRow({
        backlogItemPublicId: "1",
        finalBoardColumn: "done",
        outcome: "completed",
        storyPointsAtClosure: 1,
        acceptanceCriteriaTotalCount: 2,
        acceptanceCriteriaPendingCount: 1,
        acceptanceCriteriaDoneCount: 1,
        acceptanceCriteriaReviewedCount: 0,
      }),
      frozenRow({
        backlogItemPublicId: "2",
        finalBoardColumn: "done",
        outcome: "completed",
        storyPointsAtClosure: 1,
        acceptanceCriteriaTotalCount: 2,
        acceptanceCriteriaPendingCount: 0,
        acceptanceCriteriaDoneCount: 0,
        acceptanceCriteriaReviewedCount: 2,
      }),
    ]
    assertFrozenClosureSnapshotCompleteForV2(items)
    const m = computeSprintMetricsV2FromFrozenItems(items)
    assert.equal(m.itemsWithPendingAcceptanceCriteriaCount, 1)
    assert.equal(m.itemsWithNotFullyReviewedAcceptanceCriteriaCount, 1)
  })

  it("is stable if a hypothetical live item changes (snapshot unchanged)", () => {
    const snapshot = [
      frozenRow({
        backlogItemPublicId: "1",
        finalBoardColumn: "done",
        outcome: "completed",
        storyPointsAtClosure: 8,
        acceptanceCriteriaTotalCount: 0,
        acceptanceCriteriaPendingCount: 0,
        acceptanceCriteriaDoneCount: 0,
        acceptanceCriteriaReviewedCount: 0,
      }),
    ]
    assertFrozenClosureSnapshotCompleteForV2(snapshot)
    const a = computeSprintMetricsV2FromFrozenItems(snapshot)
    const b = computeSprintMetricsV2FromFrozenItems(structuredClone(snapshot))
    assert.deepEqual(a, b)
    assert.equal(a.committedStoryPoints, 8)
  })

  it("empty closure items yields zero aggregates and null point percentage", () => {
    assertFrozenClosureSnapshotCompleteForV2([])
    const m = computeSprintMetricsV2FromFrozenItems([])
    assert.equal(m.committedStoryPoints, 0)
    assert.equal(m.completionPercentageByStoryPoints, null)
    assert.equal(m.carryoverItemsCount, 0)
    assert.equal(m.carryoverStoryPoints, 0)
  })
})
