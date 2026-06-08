import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type {
  WorkspaceAuditLogListForProjectInput,
  WorkspaceAuditLogListRow,
} from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { ProjectRuntimeInvalidInputError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { FlowTimeScrumNotSupportedError } from "../domain/flow-time.errors.js"
import { FlowTimeService } from "./flow-time.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "00000000-0000-4000-8000-000000000002"
const colReady = "00000000-0000-4000-8000-0000000000a1"
const colDoing = "00000000-0000-4000-8000-0000000000b2"
const colDone = "00000000-0000-4000-8000-0000000000c3"
const itemA = "00000000-0000-4000-8000-0000000000d1"

const flow: ProjectKanbanFlowConfigState = {
  workspacePublicId: ws,
  projectPublicId: proj,
  entryColumnPublicId: colReady,
  wipNearThresholdRatio: 0.8,
  columns: [
    {
      columnPublicId: colReady,
      name: "Ready",
      position: 0,
      wipLimit: null,
      policyText: "",
      wipEnforcement: "informational",
    },
    {
      columnPublicId: colDoing,
      name: "In Progress",
      position: 1,
      wipLimit: null,
      policyText: "",
      wipEnforcement: "informational",
    },
    {
      columnPublicId: "00000000-0000-4000-8000-0000000000r3",
      name: "Review",
      position: 2,
      wipLimit: null,
      policyText: "",
      wipEnforcement: "informational",
    },
    {
      columnPublicId: colDone,
      name: "Done",
      position: 3,
      wipLimit: null,
      policyText: "",
      wipEnforcement: "informational",
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
}

function baseItem(id: string, title: string): ScrumBacklogItemState {
  const now = new Date("2026-04-09T12:00:00.000Z")
  return {
    backlogItemPublicId: id,
    workspacePublicId: ws,
    projectPublicId: proj,
    itemType: "user_story",
    title,
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
    kanbanColumnPublicId: colDone,
    isBlocked: false,
    blockedReason: null,
  }
}

class MemAudit implements WorkspaceAuditLogRepository {
  constructor(public rows: WorkspaceAuditLogListRow[]) {}
  async append(): Promise<void> {}
  async listForProject(_input: WorkspaceAuditLogListForProjectInput): Promise<WorkspaceAuditLogListRow[]> {
    return this.rows
  }
}

class MemBacklog implements ScrumBacklogRepository {
  constructor(private readonly items: ScrumBacklogItemState[]) {}
  async insert(): Promise<void> {}
  async replace(): Promise<void> {}
  async findByProjectAndItemId(): Promise<ScrumBacklogItemState | null> {
    return null
  }
  async listByProject(): Promise<ScrumBacklogItemState[]> {
    return []
  }
  async maxSortOrderAmongSiblings(): Promise<number> {
    return 0
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
  async listKanbanBoardItems(): Promise<ScrumBacklogItemState[]> {
    return this.items.map((x) => ({ ...x }))
  }
  async countItemsInKanbanColumn(): Promise<number> {
    return 0
  }
  async maxSortOrderKanbanBacklog(): Promise<number> {
    return 0
  }
  async minSortOrderKanbanBacklog(): Promise<number | null> {
    return null
  }
}

const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
const auditor = minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })

function runtimeKanban(): ProjectRuntimeService {
  return {
    requireKanbanWorkspaceRuntimeProject: async () => {
      return {} as never
    },
  } as unknown as ProjectRuntimeService
}

function runtimeScrum(): ProjectRuntimeService {
  return {
    requireKanbanWorkspaceRuntimeProject: async () => {
      throw new ProjectRuntimeInvalidInputError("scrum not kanban")
    },
  } as unknown as ProjectRuntimeService
}

function kanbanFlowServiceOk(): KanbanFlowService {
  return {
    getFlowConfigOrThrow: async () => flow,
  } as unknown as KanbanFlowService
}

function auditRowsA(): WorkspaceAuditLogListRow[] {
  return [
    {
      auditEventPublicId: randomUUID(),
      workspacePublicId: ws,
      category: "kanban_backlog_item",
      action: "released_to_flow",
      occurredAt: new Date("2026-03-01T10:00:00.000Z"),
      resourceProjectPublicId: proj,
      resourceBacklogItemPublicId: itemA,
      previousValue: null,
      nextValue: { kanbanColumnPublicId: colReady },
    },
    {
      auditEventPublicId: randomUUID(),
      workspacePublicId: ws,
      category: "kanban_board_item",
      action: "moved_between_columns",
      occurredAt: new Date("2026-03-01T11:00:00.000Z"),
      resourceProjectPublicId: proj,
      resourceBacklogItemPublicId: itemA,
      previousValue: { fromColumnPublicId: colReady, toColumnPublicId: colDoing },
      nextValue: { toColumnPublicId: colDoing },
    },
    {
      auditEventPublicId: randomUUID(),
      workspacePublicId: ws,
      category: "kanban_board_item",
      action: "moved_between_columns",
      occurredAt: new Date("2026-03-10T10:00:00.000Z"),
      resourceProjectPublicId: proj,
      resourceBacklogItemPublicId: itemA,
      previousValue: { fromColumnPublicId: colDoing, toColumnPublicId: colDone },
      nextValue: { toColumnPublicId: colDone },
    },
  ]
}

describe("FlowTimeService", () => {
  it("agregado: media lead/cycle y redondeo 1 decimal", async () => {
    const mem = new MemAudit(auditRowsA())
    const svc = new FlowTimeService(
      runtimeKanban(),
      kanbanFlowServiceOk(),
      new MemBacklog([baseItem(itemA, "Historia A")]),
      mem,
    )
    const out = await svc.getFlowTime(
      sm,
      ws,
      proj,
      { from: "2026-03-01T00:00:00.000Z", to: "2026-03-15T00:00:00.000Z" },
      new Date("2026-04-01T00:00:00.000Z"),
    )
    assert.equal(out.sample.completedItemsCount, 1)
    assert.equal(out.hasSufficientData, false)
    assert.equal(out.leadTime.meanDays, 9)
    assert.equal(out.cycleTime.meanDays, 9)
  })

  it("Scrum: scrum_not_supported", async () => {
    const svc = new FlowTimeService(
      runtimeScrum(),
      kanbanFlowServiceOk(),
      new MemBacklog([]),
      new MemAudit([]),
    )
    await assert.rejects(
      () =>
        svc.getFlowTime(
          sm,
          ws,
          proj,
          {},
          new Date(),
        ),
      (e: unknown) => e instanceof FlowTimeScrumNotSupportedError,
    )
  })

  it("auditor: includeItemDetails sin títulos", async () => {
    const mem = new MemAudit(auditRowsA())
    const svc = new FlowTimeService(
      runtimeKanban(),
      kanbanFlowServiceOk(),
      new MemBacklog([baseItem(itemA, "Secreto")]),
      mem,
    )
    const out = await svc.getFlowTime(
      auditor,
      ws,
      proj,
      { from: "2026-03-01T00:00:00.000Z", to: "2026-03-15T00:00:00.000Z", includeItemDetails: true },
      new Date("2026-04-01T00:00:00.000Z"),
    )
    assert.ok(out.items)
    assert.equal(out.items!.length, 1)
    assert.equal(out.items![0]!.title, null)
    assert.equal(out.items![0]!.detailTitlesRedacted, true)
  })

  it("N=0: empty y sin media", async () => {
    const svc = new FlowTimeService(
      runtimeKanban(),
      kanbanFlowServiceOk(),
      new MemBacklog([]),
      new MemAudit([]),
    )
    const out = await svc.getFlowTime(
      sm,
      ws,
      proj,
      { from: "2025-01-01T00:00:00.000Z", to: "2025-01-02T00:00:00.000Z" },
      new Date("2026-01-15T00:00:00.000Z"),
    )
    assert.equal(out.sample.completedItemsCount, 0)
    assert.equal(out.leadTime.meanDays, null)
    assert.ok(out.dataQualityWarnings.some((w) => w.code === "empty"))
  })
})
