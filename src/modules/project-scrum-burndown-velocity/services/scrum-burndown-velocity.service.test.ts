import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SprintClosureState } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ProjectScrumSprintAssignmentState } from "../../project-scrum-sprint-planning/domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import { BURNDOWN_VELOCITY_CALCULATION_VERSION } from "../domain/burndown-velocity.constants.js"
import { BurndownVelocityValidationError } from "../domain/burndown-velocity.errors.js"
import { idealRemainingLinear } from "./burndown-replay.js"
import { ScrumBurndownVelocityService } from "./scrum-burndown-velocity.service.js"
import { assertCanReadScrumBurndownVelocity } from "../policies/scrum-burndown-velocity-read.policy.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"

const WS = "a1000000-0000-4000-8000-000000000001"
const PROJ = "a2000000-0000-4000-8000-000000000002"
const SPRINT = "a3000000-0000-4000-8000-000000000003"
const U1 = "b1000000-0000-4000-8000-0000000000aa"
const ITEM1 = "c1000000-0000-4000-8000-0000000000b1"

function v2Item(
  id: string,
  pts: number,
  col: "to_do" | "in_progress" | "in_review" | "done",
  out: "completed" | "not_completed",
) {
  return {
    backlogItemPublicId: id,
    itemType: "user_story",
    title: "x",
    finalBoardColumn: col,
    outcome: out,
    backlogStatusAtClosure: "done",
    sprintSortOrder: 0,
    storyPointsAtClosure: pts,
    acceptanceCriteriaTotalCount: 0,
    acceptanceCriteriaPendingCount: 0,
    acceptanceCriteriaDoneCount: 0,
    acceptanceCriteriaReviewedCount: 0,
  }
}

class MemAudit implements WorkspaceAuditLogRepository {
  rows: WorkspaceAuditLogListRow[] = []
  async append(): Promise<void> {
    return
  }
  async listForProject() {
    return this.rows
  }
}

const emptyBacklog: ScrumBacklogRepository = {
  insert: async () => {},
  replace: async () => {},
  findByProjectAndItemId: async () => null,
  listByProject: async () => [],
  maxSortOrderAmongSiblings: async () => 0,
  bulkSetSortOrders: async () => {},
  pushAssignmentEventAndSetAssignee: async () => null,
  adjustCommentsCount: async () => false,
  listKanbanBacklogItems: async () => [],
  countItemsInKanbanColumn: async () => 0,
  maxSortOrderKanbanBacklog: async () => 0,
  minSortOrderKanbanBacklog: async () => null,
  listKanbanBoardItems: async () => [],
}

class MemSprint implements Pick<
  ScrumSprintPlanningRepository,
  "findSprintByPublicId" | "listSprintsByProject" | "listMembershipsBySprintOrdered"
> {
  sprints: ScrumSprintState[] = []
  mems: ProjectScrumSprintAssignmentState[] = []
  async findSprintByPublicId(
    _w: string,
    _p: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState | null> {
    return this.sprints.find((s) => s.sprintPublicId === sprintPublicId) ?? null
  }
  async listSprintsByProject() {
    return this.sprints
  }
  async listMembershipsBySprintOrdered() {
    return this.mems
  }
}

const runtimeOk: ProjectRuntimeService = {
  requireScrumWorkspaceRuntimeProject: async () => {
    return
  },
} as unknown as ProjectRuntimeService

describe("scrum-burndown-velocity.service", () => {
  it("rejects planning sprint for burndown", async () => {
    const sr = new MemSprint()
    sr.sprints.push({
      sprintPublicId: SPRINT,
      workspacePublicId: WS,
      projectPublicId: PROJ,
      name: "S",
      goal: "g",
      status: "planning",
      startDate: new Date(0),
      endDate: new Date(1),
      createdByUserPublicId: U1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      closure: null,
      review: null,
      retrospective: null,
    })
    const svc = new ScrumBurndownVelocityService(
      sr,
      emptyBacklog,
      new MemAudit(),
      runtimeOk,
      { getBasicSprintMetrics: async () => {
        throw new Error("no")
      } } as unknown as SprintMetricsService,
    )
    await assert.rejects(
      () => svc.getSprintBurndown(WS, PROJ, SPRINT, { includeIdealLine: true }),
      BurndownVelocityValidationError,
    )
  })

  it("closed burndown with synthetic close uses calculationVersion and ideal line on last day 0", async () => {
    const closedAt = new Date(Date.UTC(2025, 0, 8, 18, 0, 0))
    const start = new Date(Date.UTC(2025, 0, 1, 0, 0, 0))
    const end = new Date(Date.UTC(2025, 0, 8, 0, 0, 0))
    const items = [v2Item(ITEM1, 5, "done", "completed")]
    const closure: SprintClosureState = {
      closedAt,
      closedByUserPublicId: U1,
      closureNote: "",
      goalAchieved: true,
      sprintGoalAtClosure: "G",
      items,
    }
    const sr = new MemSprint()
    sr.sprints.push({
      sprintPublicId: SPRINT,
      workspacePublicId: WS,
      projectPublicId: PROJ,
      name: "S",
      goal: "g",
      status: "closed",
      startDate: start,
      endDate: end,
      createdByUserPublicId: U1,
      createdAt: start,
      updatedAt: closedAt,
      closure,
      review: null,
      retrospective: null,
    })
    const audit = new MemAudit()
    const svc = new ScrumBurndownVelocityService(
      sr,
      emptyBacklog,
      audit,
      runtimeOk,
      { getBasicSprintMetrics: async () => {
        throw new Error("no")
      } } as unknown as SprintMetricsService,
    )
    const r = await svc.getSprintBurndown(WS, PROJ, SPRINT, { includeIdealLine: true })
    assert.equal(r.calculationVersion, BURNDOWN_VELOCITY_CALCULATION_VERSION)
    assert.equal(r.unit, "story_points")
    assert.equal(r.days.length >= 1, true)
    const last = r.days[r.days.length - 1]!
    assert.equal(last.remainingPoints, 0)
    const n = r.days.length
    assert.equal(last.idealRemainingPoints, idealRemainingLinear(r.initialCommittedPoints ?? 0, n - 1, n))
    assert.equal(r.hasSufficientData, true)
  })

  it("velocity uses lastN and averages completed points", async () => {
    const ms: SprintMetricsService = {
      getBasicSprintMetrics: async (_w, _p, sprintPublicId) => ({
        sprintPublicId,
        projectPublicId: PROJ,
        workspacePublicId: WS,
        status: "closed",
        goalAchieved: true,
        goalAtClosure: "g",
        closedAt: new Date().toISOString(),
        committedItemsCount: 1,
        completedItemsCount: 1,
        notCompletedItemsCount: 0,
        completionPercentage: 100,
        finalBoardDistribution: { to_do: 0, in_progress: 0, in_review: 0, done: 1 },
        plannedDurationDays: 5,
        metricsSchemaVersion: 2,
        committedStoryPoints: 3,
        completedStoryPoints: 3,
        notCompletedStoryPoints: 0,
        completionPercentageByStoryPoints: 100,
        estimatedCommittedItemsCount: 1,
        unestimatedCommittedItemsCount: 0,
        itemsWithPendingAcceptanceCriteriaCount: 0,
        itemsWithNotFullyReviewedAcceptanceCriteriaCount: 0,
        carryoverItemsCount: 0,
        carryoverStoryPoints: 0,
      }),
    } as unknown as SprintMetricsService
    const closedAt1 = new Date(Date.UTC(2024, 5, 1, 0, 0, 0))
    const closedAt2 = new Date(Date.UTC(2024, 4, 1, 0, 0, 0))
    const s1: ScrumSprintState = {
      sprintPublicId: "s1",
      workspacePublicId: WS,
      projectPublicId: PROJ,
      name: "A",
      goal: "g",
      status: "closed",
      startDate: new Date(0),
      endDate: new Date(0),
      createdByUserPublicId: U1,
      createdAt: new Date(0),
      updatedAt: closedAt1,
      closure: {
        closedAt: closedAt1,
        closedByUserPublicId: U1,
        closureNote: "",
        goalAchieved: true,
        sprintGoalAtClosure: "G",
        items: [v2Item(ITEM1, 3, "done", "completed")],
      },
      review: null,
      retrospective: null,
    }
    const s2: ScrumSprintState = {
      ...s1,
      sprintPublicId: "s2",
      name: "B",
      closure: {
        ...s1.closure!,
        closedAt: closedAt2,
      },
    }
    const sr = new MemSprint()
    sr.sprints = [s1, s2]
    const audit = new MemAudit()
    const svc = new ScrumBurndownVelocityService(
      sr,
      emptyBacklog,
      audit,
      runtimeOk,
      ms,
    )
    const v = await svc.getProjectVelocity(WS, PROJ, 6)
    assert.equal(v.sprints.length, 2)
    assert.equal(v.lastN, 6)
    assert.equal(v.averageVelocityLastN, 3)
    assert.equal(v.hasSufficientData, true)
  })

  it("assertCanReadScrumBurndownVelocity allows developer", () => {
    assert.doesNotThrow(() =>
      assertCanReadScrumBurndownVelocity(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })
})
