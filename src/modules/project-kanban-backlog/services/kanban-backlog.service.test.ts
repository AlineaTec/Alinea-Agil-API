import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import { KanbanFlowNotFoundError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { KanbanBoardWipMoveAckRequiredError } from "../../project-kanban-board/domain/kanban-board.errors.js"
import { KanbanBacklogService } from "./kanban-backlog.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "00000000-0000-4000-8000-000000000002"
const entryCol = "00000000-0000-4000-8000-0000000000e1"

function baseItem(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date()
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
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
    ...over,
  }
}

class MemoryKanbanRepo implements ScrumBacklogRepository {
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

  async findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState | null> {
    return (
      this.items.find(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.backlogItemPublicId === backlogItemPublicId,
      ) ?? null
    )
  }

  async listByProject(workspacePublicId: string, projectPublicId: string): Promise<ScrumBacklogItemState[]> {
    return this.items.filter((x) => x.workspacePublicId === workspacePublicId && x.projectPublicId === projectPublicId)
  }

  async maxSortOrderAmongSiblings(): Promise<number> {
    return -1
  }

  async bulkSetSortOrders(
    workspacePublicId: string,
    projectPublicId: string,
    updates: Array<{ backlogItemPublicId: string; sortOrder: number; updatedAt: Date }>,
  ): Promise<void> {
    for (const u of updates) {
      const row = await this.findByProjectAndItemId(workspacePublicId, projectPublicId, u.backlogItemPublicId)
      if (!row) throw new Error("bulk_missing")
      await this.replace({ ...row, sortOrder: u.sortOrder, updatedAt: u.updatedAt })
    }
  }

  async pushAssignmentEventAndSetAssignee(): Promise<ScrumBacklogItemState | null> {
    return null
  }

  async adjustCommentsCount(): Promise<boolean> {
    return true
  }

  async listKanbanBacklogItems(
    workspacePublicId: string,
    projectPublicId: string,
    options?: { search?: string },
  ): Promise<ScrumBacklogItemState[]> {
    let rows = this.items.filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.kanbanColumnPublicId === null &&
        x.parentItemPublicId === null,
    )
    rows = rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
    const q = options?.search?.trim().toLowerCase()
    if (q) {
      rows = rows.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    }
    return rows.map((r) => ({ ...r }))
  }

  async countItemsInKanbanColumn(
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
  ): Promise<number> {
    return this.items.filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.kanbanColumnPublicId === columnPublicId,
    ).length
  }

  async maxSortOrderKanbanBacklog(workspacePublicId: string, projectPublicId: string): Promise<number> {
    const rows = await this.listKanbanBacklogItems(workspacePublicId, projectPublicId)
    if (rows.length === 0) return -1
    return Math.max(...rows.map((r) => r.sortOrder))
  }

  async minSortOrderKanbanBacklog(workspacePublicId: string, projectPublicId: string): Promise<number | null> {
    const rows = await this.listKanbanBacklogItems(workspacePublicId, projectPublicId)
    if (rows.length === 0) return null
    return Math.min(...rows.map((r) => r.sortOrder))
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

function flowState(over: Partial<ProjectKanbanFlowConfigState> = {}): ProjectKanbanFlowConfigState {
  const now = new Date()
  return {
    workspacePublicId: ws,
    projectPublicId: proj,
    entryColumnPublicId: entryCol,
    wipNearThresholdRatio: 0.8,
    columns: [
      {
        columnPublicId: entryCol,
        name: "Ready",
        position: 0,
        wipLimit: null,
        policyText: "",
        wipEnforcement: "informational",
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

class FakeKanbanFlow implements Pick<KanbanFlowService, "getFlowConfigOrThrow" | "findColumnByPublicId"> {
  flow: ProjectKanbanFlowConfigState

  constructor(flow: ProjectKanbanFlowConfigState) {
    this.flow = flow
  }

  async getFlowConfigOrThrow(workspacePublicId: string, projectPublicId: string): Promise<ProjectKanbanFlowConfigState> {
    if (workspacePublicId !== ws || projectPublicId !== proj) {
      throw new KanbanFlowNotFoundError()
    }
    return this.flow
  }

  findColumnByPublicId(flow: ProjectKanbanFlowConfigState, columnPublicId: string) {
    return flow.columns.find((c) => c.columnPublicId === columnPublicId) ?? null
  }
}

const reader = () => minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
const coordinator = () =>
  minimalWorkspaceMember({ userPublicId: "u-po", workspaceRoleMethodological: "product_owner" })

describe("KanbanBacklogService", () => {
  it("lists only backlog items with search", async () => {
    const repo = new MemoryKanbanRepo()
    const a = baseItem({ title: "Alpha", backlogItemPublicId: randomUUID(), sortOrder: 0 })
    const b = baseItem({ title: "Beta bee", backlogItemPublicId: randomUUID(), sortOrder: 1 })
    const inFlow = baseItem({
      title: "Gamma",
      backlogItemPublicId: randomUUID(),
      kanbanColumnPublicId: entryCol,
      sortOrder: 2,
    })
    repo.items = [a, b, inFlow]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const list = await svc.listKanbanBacklog(reader(), ws, proj, { search: "bee" })
    assert.equal(list.length, 1)
    assert.equal(list[0]?.backlogItemPublicId, b.backlogItemPublicId)
  })

  it("creates item in backlog", async () => {
    const repo = new MemoryKanbanRepo()
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const created = await svc.createKanbanBacklogItem(reader(), ws, proj, {
      itemType: "user_story",
      title: " New ",
      description: "d",
    })
    assert.equal(created.kanbanColumnPublicId, null)
    assert.equal(created.parentItemPublicId, null)
    assert.equal(created.title, "New")
  })

  it("updates backlog item", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({ backlogItemPublicId: randomUUID() })
    repo.items = [row]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const updated = await svc.updateKanbanBacklogItem(reader(), ws, proj, row.backlogItemPublicId, {
      title: "X",
    })
    assert.equal(updated.title, "X")
  })

  it("reorders backlog", async () => {
    const repo = new MemoryKanbanRepo()
    const a = baseItem({ backlogItemPublicId: randomUUID(), sortOrder: 0, title: "a" })
    const b = baseItem({ backlogItemPublicId: randomUUID(), sortOrder: 1, title: "b" })
    repo.items = [a, b]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const after = await svc.reorderKanbanBacklog(coordinator(), ws, proj, [b.backlogItemPublicId, a.backlogItemPublicId])
    assert.equal(after[0]?.backlogItemPublicId, b.backlogItemPublicId)
    assert.equal(after[0]?.sortOrder, 0)
  })

  it("releases item to entry column", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({ backlogItemPublicId: randomUUID(), itemType: "task" })
    repo.items = [row]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const out = await svc.releaseItemToFlow(coordinator(), ws, proj, row.backlogItemPublicId)
    assert.equal(out.kanbanColumnPublicId, entryCol)
  })

  it("gets backlog item when it is on the board (released to flow)", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({
      backlogItemPublicId: randomUUID(),
      itemType: "task",
      kanbanColumnPublicId: entryCol,
    })
    repo.items = [row]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const got = await svc.getKanbanBacklogItem(reader(), ws, proj, row.backlogItemPublicId)
    assert.equal(got.kanbanColumnPublicId, entryCol)
    assert.equal(got.title, row.title)
  })

  it("updates item while on the board", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({
      backlogItemPublicId: randomUUID(),
      kanbanColumnPublicId: entryCol,
    })
    repo.items = [row]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const updated = await svc.updateKanbanBacklogItem(reader(), ws, proj, row.backlogItemPublicId, {
      title: "On board",
    })
    assert.equal(updated.title, "On board")
    assert.equal(updated.kanbanColumnPublicId, entryCol)
  })

  it("release with WIP (warning) requires ack to touch or exceed", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({ backlogItemPublicId: randomUUID() })
    repo.items = [
      baseItem({ backlogItemPublicId: randomUUID(), kanbanColumnPublicId: entryCol, itemType: "task" }),
      row,
    ]
    const flow = flowState({
      columns: [
        {
          columnPublicId: entryCol,
          name: "Ready",
          position: 0,
          wipLimit: 1,
          policyText: "",
          wipEnforcement: "warning",
        },
      ],
    })
    const svc = new KanbanBacklogService(repo, new FakeRuntime() as never, new FakeKanbanFlow(flow) as never, null)
    await assert.rejects(
      () => svc.releaseItemToFlow(coordinator(), ws, proj, row.backlogItemPublicId),
      KanbanBoardWipMoveAckRequiredError,
    )
    const ok = await svc.releaseItemToFlow(coordinator(), ws, proj, row.backlogItemPublicId, {
      allowWipOverride: true,
    })
    assert.equal(ok.kanbanColumnPublicId, entryCol)
  })

  it("return to backlog inserts on top", async () => {
    const repo = new MemoryKanbanRepo()
    const top = baseItem({ backlogItemPublicId: randomUUID(), sortOrder: 0 })
    const released = baseItem({
      backlogItemPublicId: randomUUID(),
      kanbanColumnPublicId: entryCol,
      sortOrder: 5,
    })
    repo.items = [top, released]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    const back = await svc.returnItemToBacklog(coordinator(), ws, proj, released.backlogItemPublicId)
    assert.equal(back.kanbanColumnPublicId, null)
    assert.equal(back.sortOrder < top.sortOrder, true)
  })

  it("epic cannot be released", async () => {
    const repo = new MemoryKanbanRepo()
    const row = baseItem({ backlogItemPublicId: randomUUID(), itemType: "epic" })
    repo.items = [row]
    const svc = new KanbanBacklogService(
      repo,
      new FakeRuntime() as never,
      new FakeKanbanFlow(flowState()) as never,
      null,
    )
    await assert.rejects(() => svc.releaseItemToFlow(coordinator(), ws, proj, row.backlogItemPublicId), /Only bug/)
  })
})
