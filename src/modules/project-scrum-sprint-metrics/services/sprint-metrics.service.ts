import { SPRINT_BOARD_COLUMNS } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import type { SprintClosureSnapshotItem } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { BasicSprintMetrics, FinalBoardDistribution } from "../domain/basic-sprint-metrics.js"
import {
  assertFrozenClosureSnapshotCompleteForV2,
  computeSprintMetricsV2FromFrozenItems,
} from "../domain/sprint-metrics-v2.aggregation.js"
import {
  SprintMetricsNotFoundError,
  SprintMetricsValidationError,
} from "../domain/sprint-metrics.errors.js"

function assertClosureItemsConsistent(items: SprintClosureSnapshotItem[]): void {
  for (const row of items) {
    const inDoneColumn = row.finalBoardColumn === "done"
    const markedCompleted = row.outcome === "completed"
    if (markedCompleted !== inDoneColumn) {
      throw new SprintMetricsValidationError(
        "Closure snapshot has inconsistent outcome vs final board column for at least one item.",
      )
    }
  }
}

/**
 * Días calendario inclusivos entre dos fechas (solo componente fecha UTC).
 * `null` si falta dato o end < start.
 */
function plannedDurationDaysInclusive(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  if (e < s) return null
  return Math.floor((e - s) / 86_400_000) + 1
}

function emptyDistribution(): FinalBoardDistribution {
  return {
    to_do: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  }
}

export class SprintMetricsService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
  ) {}

  async getBasicSprintMetrics(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<BasicSprintMetrics> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const sprint = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!sprint) {
      throw new SprintMetricsNotFoundError()
    }

    if (sprint.status !== "closed") {
      throw new SprintMetricsValidationError(
        "Basic sprint metrics are only available for closed sprints.",
      )
    }

    if (!sprint.closure) {
      throw new SprintMetricsValidationError(
        "Closed sprint is missing closure snapshot; cannot compute metrics.",
      )
    }

    const items = sprint.closure.items
    if (!Array.isArray(items)) {
      throw new SprintMetricsValidationError("Closure snapshot items are invalid.")
    }

    assertClosureItemsConsistent(items)

    assertFrozenClosureSnapshotCompleteForV2(items)

    const committedItemsCount = items.length
    const completedItemsCount = items.filter((r) => r.outcome === "completed").length
    const notCompletedItemsCount = items.filter((r) => r.outcome === "not_completed").length

    if (completedItemsCount + notCompletedItemsCount !== committedItemsCount) {
      throw new SprintMetricsValidationError("Closure snapshot outcomes do not match item count.")
    }

    const finalBoardDistribution = emptyDistribution()
    for (const row of items) {
      finalBoardDistribution[row.finalBoardColumn] += 1
    }

    const completionPercentage =
      committedItemsCount === 0
        ? null
        : Math.round((completedItemsCount / committedItemsCount) * 100)

    const plannedDurationDays = plannedDurationDaysInclusive(sprint.startDate, sprint.endDate)

    const v2 = computeSprintMetricsV2FromFrozenItems(items)

    const c = sprint.closure
    return {
      sprintPublicId: sprint.sprintPublicId,
      projectPublicId: sprint.projectPublicId,
      workspacePublicId: sprint.workspacePublicId,
      status: sprint.status,
      goalAchieved: c.goalAchieved,
      goalAtClosure: c.sprintGoalAtClosure,
      closedAt: c.closedAt.toISOString(),
      committedItemsCount,
      completedItemsCount,
      notCompletedItemsCount,
      completionPercentage,
      finalBoardDistribution,
      plannedDurationDays,
      ...v2,
    }
  }
}

/** Serialización HTTP estable para el MVP. */
export function basicSprintMetricsToJson(m: BasicSprintMetrics) {
  return {
    sprintPublicId: m.sprintPublicId,
    projectPublicId: m.projectPublicId,
    workspacePublicId: m.workspacePublicId,
    status: m.status,
    goalAchieved: m.goalAchieved,
    goalAtClosure: m.goalAtClosure,
    closedAt: m.closedAt,
    committedItemsCount: m.committedItemsCount,
    completedItemsCount: m.completedItemsCount,
    notCompletedItemsCount: m.notCompletedItemsCount,
    completionPercentage: m.completionPercentage,
    finalBoardDistribution: SPRINT_BOARD_COLUMNS.reduce(
      (acc, col) => {
        acc[col] = m.finalBoardDistribution[col]
        return acc
      },
      {} as Record<string, number>,
    ),
    plannedDurationDays: m.plannedDurationDays,
    metricsSchemaVersion: m.metricsSchemaVersion,
    committedStoryPoints: m.committedStoryPoints,
    completedStoryPoints: m.completedStoryPoints,
    notCompletedStoryPoints: m.notCompletedStoryPoints,
    completionPercentageByStoryPoints: m.completionPercentageByStoryPoints,
    estimatedCommittedItemsCount: m.estimatedCommittedItemsCount,
    unestimatedCommittedItemsCount: m.unestimatedCommittedItemsCount,
    itemsWithPendingAcceptanceCriteriaCount: m.itemsWithPendingAcceptanceCriteriaCount,
    itemsWithNotFullyReviewedAcceptanceCriteriaCount: m.itemsWithNotFullyReviewedAcceptanceCriteriaCount,
    carryoverItemsCount: m.carryoverItemsCount,
    carryoverStoryPoints: m.carryoverStoryPoints,
  }
}
