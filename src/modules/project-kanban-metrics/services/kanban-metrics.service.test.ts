import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type {
  WorkspaceAuditLogListForProjectInput,
  WorkspaceAuditLogListRow,
} from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { KanbanMetricsForbiddenError, KanbanMetricsValidationError } from "../domain/kanban-metrics.errors.js"
import { KanbanMetricsService, resolveThroughputDateRange, startOfUtcWeekMonday } from "./kanban-metrics.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "00000000-0000-4000-8000-000000000002"
const colReady = "00000000-0000-4000-8000-0000000000a1"
const colDoing = "00000000-0000-4000-8000-0000000000b2"
const colDone = "00000000-0000-4000-8000-0000000000c3"

function item(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date("2026-04-09T12:00:00.000Z")
  return {
    backlogItemPublicId: randomUUID(),
    workspacePublicId: ws,
    projectPublicId: proj,
    itemType: "user_story",
    title: "T",
    description: "",
    status: "open",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: "u1",
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "none",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: colReady,
    isBlocked: false,
    blockedReason: null,
    ...over,
  }
}

class MemRepo implements ScrumBacklogRepository {
  items: ScrumBacklogItemState[] = []

  async insert(state: ScrumBacklogItemState): Promise<void> {
    this.items.push({ ...state })
  }

  async replace(state: ScrumBacklogItemState): Promise<void> {
    const i = this.items.findIndex(
      (x) =>
        x.workspacePublicId === state.workspacePublicId &&
        x.projectPublicId === state.projectPublicId &&
        x.backlogItemPublicId === state.backlogItemPublicId,
    )
    if (i === -1) throw new Error("not_found")
    this.items[i] = { ...state }
  }

  async findByProjectAndItemId(): Promise<ScrumBacklogItemState | null> {
    return null
  }

  async listByProject(): Promise<ScrumBacklogItemState[]> {
    return []
  }

  async maxSortOrderAmongSiblings(): Promise<number> {
    return -1
  }

  async bulkSetSortOrders(): Promise<void> {}

  async pushAssignmentEventAndSetAssignee(): Promise<ScrumBacklogItemState | null> {
    return null
  }

  async adjustCommentsCount(): Promise<boolean> {
    return true
  }

  async listKanbanBacklogItems(): Promise<ScrumBacklogItemState[]> {
    return []
  }

  async listKanbanBoardItems(workspacePublicId: string, projectPublicId: string): Promise<ScrumBacklogItemState[]> {
    return this.items
      .filter(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.kanbanColumnPublicId !== null,
      )
      .map((r) => ({ ...r }))
  }

  async countItemsInKanbanColumn(): Promise<number> {
    return 0
  }

  async maxSortOrderKanbanBacklog(): Promise<number> {
    return -1
  }

  async minSortOrderKanbanBacklog(): Promise<number | null> {
    return null
  }
}

class FakeRuntime {
  async requireKanbanWorkspaceRuntimeProject(): Promise<WorkspaceRuntimeProjectState> {
    return {
      projectPublicId: proj,
      workspacePublicId: ws,
      sourceDraftPublicId: "d",
      projectName: "P",
      operationalApproach: "kanban",
      initialConfigurationSummary: {
        kind: "kanban",
        materializationContainerReady: true,
        continuousBoard: true,
        baseColumns: true,
        wipPolicies: false,
        baseMetrics: false,
      },
      status: "active",
      materializedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
}

function flowThreeCols(): ProjectKanbanFlowConfigState {
  const now = new Date("2026-01-01T00:00:00.000Z")
  return {
    workspacePublicId: ws,
    projectPublicId: proj,
    entryColumnPublicId: colReady,
    wipNearThresholdRatio: 0.8,
    columns: [
      {
        columnPublicId: colReady,
        name: "Ready",
        position: 0,
        wipLimit: 5,
        policyText: "",
        wipEnforcement: "informational",
      },
      {
        columnPublicId: colDoing,
        name: "Doing",
        position: 1,
        wipLimit: 2,
        policyText: "",
        wipEnforcement: "warning",
      },
      {
        columnPublicId: colDone,
        name: "Done",
        position: 2,
        wipLimit: null,
        policyText: "",
        wipEnforcement: "informational",
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

class FakeFlow implements Pick<KanbanFlowService, "getFlowConfigOrThrow"> {
  constructor(private readonly flow: ProjectKanbanFlowConfigState) {}

  async getFlowConfigOrThrow(): Promise<ProjectKanbanFlowConfigState> {
    return this.flow
  }
}

class FakeAudit implements WorkspaceAuditLogRepository {
  rows: WorkspaceAuditLogListRow[] = []
  calls: WorkspaceAuditLogListForProjectInput[] = []

  async append(): Promise<void> {}

  async listForProject(input: WorkspaceAuditLogListForProjectInput): Promise<WorkspaceAuditLogListRow[]> {
    this.calls.push(input)
    return this.rows
  }
}

function auditRow(over: Partial<WorkspaceAuditLogListRow> & Pick<WorkspaceAuditLogListRow, "category" | "action">): WorkspaceAuditLogListRow {
  return {
    auditEventPublicId: randomUUID(),
    workspacePublicId: ws,
    resourceProjectPublicId: proj,
    resourceBacklogItemPublicId: "item-1",
    occurredAt: new Date(),
    previousValue: {},
    nextValue: {},
    ...over,
  }
}

const actor = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })

describe("kanban-metrics.service", () => {
  it("snapshot: WIP per column and blockedItemsCount", async () => {
    const repo = new MemRepo()
    const i1 = item({ backlogItemPublicId: "i1", kanbanColumnPublicId: colReady })
    const i2 = item({ backlogItemPublicId: "i2", kanbanColumnPublicId: colReady })
    const i3 = item({
      backlogItemPublicId: "i3",
      kanbanColumnPublicId: colDoing,
      isBlocked: true,
      blockedReason: "wait",
    })
    repo.items = [i1, i2, i3]
    const svc = new KanbanMetricsService(repo, new FakeRuntime() as never, new FakeFlow(flowThreeCols()) as never, null)
    const snap = await svc.getFlowSnapshot(actor, ws, proj)
    assert.equal(snap.itemsInFlowCount, 3)
    assert.equal(snap.blockedItemsCount, 1)
    const ready = snap.columns.find((c) => c.columnPublicId === colReady)
    const doing = snap.columns.find((c) => c.columnPublicId === colDoing)
    assert.equal(ready?.currentItemCount, 2)
    assert.equal(doing?.currentItemCount, 1)
    assert.equal(ready?.wipLimit, 5)
    assert.equal(snap.terminalColumnPublicId, colDone)
  })

  it("rejects forbidden actor for snapshot", async () => {
    const svc = new KanbanMetricsService(new MemRepo(), new FakeRuntime() as never, new FakeFlow(flowThreeCols()) as never, null)
    await assert.rejects(() => svc.getFlowSnapshot(minimalWorkspaceMember({}), ws, proj), KanbanMetricsForbiddenError)
  })

  it("throughput: counts moves to Done in week buckets; lead time median when audit complete", async () => {
    const repo = new MemRepo()
    const backlogId = "bi-throughput"
    repo.items = []
    const audit = new FakeAudit()
    const monday = startOfUtcWeekMonday(new Date("2026-04-08T15:00:00.000Z"))
    const tRelease = new Date(monday.getTime() + 86400000)
    const tDone = new Date(monday.getTime() + 3 * 86400000)
    audit.rows = [
      auditRow({
        resourceBacklogItemPublicId: backlogId,
        category: "kanban_backlog_item",
        action: "released_to_flow",
        occurredAt: tRelease,
        nextValue: { kanbanColumnPublicId: colReady },
      }),
      auditRow({
        resourceBacklogItemPublicId: backlogId,
        category: "kanban_board_item",
        action: "moved_between_columns",
        occurredAt: tDone,
        nextValue: { toColumnPublicId: colDone, toColumnName: "Done" },
      }),
    ]
    const svc = new KanbanMetricsService(repo, new FakeRuntime() as never, new FakeFlow(flowThreeCols()) as never, audit)
    const body = await svc.getThroughput(
      actor,
      ws,
      proj,
      { from: monday.toISOString().slice(0, 10), to: "2026-04-09" },
      new Date("2026-04-09T18:00:00.000Z"),
    )
    const week = body.weeks.find((w) => w.weekStart === monday.toISOString().slice(0, 10))
    assert.ok(week)
    assert.equal(week!.completedItemsCount, 1)
    assert.equal(body.leadTimeFromFlowEntry.sampleCount, 1)
    assert.equal(body.leadTimeFromFlowEntry.medianDays, 2)
  })

  it("throughput: no audit repo yields zero counts and no lead samples", async () => {
    const svc = new KanbanMetricsService(new MemRepo(), new FakeRuntime() as never, new FakeFlow(flowThreeCols()) as never, null)
    const body = await svc.getThroughput(actor, ws, proj, {}, new Date("2026-04-09T12:00:00.000Z"))
    assert.equal(body.leadTimeFromFlowEntry.basedOnAudit, false)
    assert.equal(body.leadTimeFromFlowEntry.sampleCount, 0)
    assert.ok(body.weeks.length >= 12)
    assert.ok(body.weeks.every((w) => w.completedItemsCount === 0))
  })

  it("validation: date range too long", () => {
    assert.throws(
      () => resolveThroughputDateRange({ from: "2025-01-01", to: "2026-04-09" }, new Date("2026-04-09T12:00:00.000Z")),
      KanbanMetricsValidationError,
    )
  })

  it("aging: ranks by days in current column; byColumn max", async () => {
    const repo = new MemRepo()
    const idOld = "aging-old"
    const idYoung = "aging-young"
    const tEnterOld = new Date("2026-03-01T10:00:00.000Z")
    const tEnterYoung = new Date("2026-04-08T10:00:00.000Z")
    const now = new Date("2026-04-09T12:00:00.000Z")
    repo.items = [
      item({
        backlogItemPublicId: idOld,
        kanbanColumnPublicId: colDoing,
        updatedAt: now,
      }),
      item({
        backlogItemPublicId: idYoung,
        kanbanColumnPublicId: colDoing,
        updatedAt: now,
      }),
    ]
    const audit = new FakeAudit()
    audit.rows = [
      auditRow({
        resourceBacklogItemPublicId: idOld,
        category: "kanban_backlog_item",
        action: "released_to_flow",
        occurredAt: new Date("2026-02-01T10:00:00.000Z"),
        nextValue: { kanbanColumnPublicId: colReady },
      }),
      auditRow({
        resourceBacklogItemPublicId: idOld,
        category: "kanban_board_item",
        action: "moved_between_columns",
        occurredAt: tEnterOld,
        nextValue: { toColumnPublicId: colDoing, toColumnName: "Doing" },
      }),
      auditRow({
        resourceBacklogItemPublicId: idYoung,
        category: "kanban_backlog_item",
        action: "released_to_flow",
        occurredAt: new Date("2026-04-07T10:00:00.000Z"),
        nextValue: { kanbanColumnPublicId: colReady },
      }),
      auditRow({
        resourceBacklogItemPublicId: idYoung,
        category: "kanban_board_item",
        action: "moved_between_columns",
        occurredAt: tEnterYoung,
        nextValue: { toColumnPublicId: colDoing, toColumnName: "Doing" },
      }),
    ]
    const svc = new KanbanMetricsService(repo, new FakeRuntime() as never, new FakeFlow(flowThreeCols()) as never, audit)
    const aging = await svc.getAging(actor, ws, proj, now)
    assert.equal(aging.topOldest[0]!.backlogItemPublicId, idOld)
    assert.equal(aging.topOldest[0]!.title, "T")
    assert.ok(aging.topOldest[0]!.daysInCurrentColumn > aging.topOldest[1]!.daysInCurrentColumn)
    const doingAgg = aging.byColumn.find((c) => c.columnPublicId === colDoing)
    assert.equal(doingAgg?.itemCount, 2)
    assert.ok((doingAgg?.maxDaysInCurrentColumn ?? 0) >= 39)
  })
})
