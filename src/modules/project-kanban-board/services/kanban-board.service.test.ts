import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import { KanbanBacklogService } from "../../project-kanban-backlog/services/kanban-backlog.service.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { KanbanBoardWipMoveAckRequiredError } from "../domain/kanban-board.errors.js"
import { KanbanBoardService } from "./kanban-board.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "00000000-0000-4000-8000-000000000002"
const colA = "00000000-0000-4000-8000-0000000000a1"
const colB = "00000000-0000-4000-8000-0000000000b2"

function item(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
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
    kanbanColumnPublicId: colA,
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

  async listByProject(): Promise<ScrumBacklogItemState[]> {
    return []
  }

  async listByProjectPage(): Promise<ScrumBacklogItemState[]> {
    return []
  }

  async countByProject(): Promise<number> {
    return 0
  }

  async searchWorkItemOptions(): Promise<never[]> {
    return []
  }

  async listRoadmapWorkItems(): Promise<never[]> {
    return []
  }

  async listAvailableSprintCommitItems(): Promise<never[]> {
    return []
  }

  async countAvailableSprintCommitItems(): Promise<number> {
    return 0
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
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
    const q = options?.search?.trim().toLowerCase()
    if (q) {
      rows = rows.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    }
    return rows.map((r) => ({ ...r }))
  }

  fullListCalls = 0

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

  async listKanbanBoardItemsByColumn(
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
    options: { skip: number; take: number },
  ): Promise<ScrumBacklogItemState[]> {
    return this.items
      .filter(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.kanbanColumnPublicId === columnPublicId,
      )
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
      .slice(options.skip, options.skip + options.take)
      .map((r) => ({ ...r }))
  }

  async listKanbanBoardItems(workspacePublicId: string, projectPublicId: string): Promise<ScrumBacklogItemState[]> {
    this.fullListCalls += 1
    return this.items
      .filter(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.kanbanColumnPublicId !== null,
      )
      .map((r) => ({ ...r }))
      .sort((a, b) => {
        const ca = String(a.kanbanColumnPublicId).localeCompare(String(b.kanbanColumnPublicId))
        if (ca !== 0) return ca
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
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

function flowTwoCols(wipB: number | null = null): ProjectKanbanFlowConfigState {
  const now = new Date()
  return {
    workspacePublicId: ws,
    projectPublicId: proj,
    entryColumnPublicId: colA,
    wipNearThresholdRatio: 0.8,
    columns: [
      {
        columnPublicId: colA,
        name: "Ready",
        position: 0,
        wipLimit: null,
        policyText: "",
        wipEnforcement: "informational",
      },
      {
        columnPublicId: colB,
        name: "Doing",
        position: 1,
        wipLimit: wipB,
        policyText: "p",
        /** Con límite: advertencia pide confirmación; sin límite, informativo. */
        wipEnforcement: wipB === null ? "informational" : "warning",
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

class FakeFlow implements Pick<KanbanFlowService, "getFlowConfigOrThrow" | "findColumnByPublicId"> {
  constructor(private readonly flow: ProjectKanbanFlowConfigState) {}
  async getFlowConfigOrThrow(): Promise<ProjectKanbanFlowConfigState> {
    return this.flow
  }
  findColumnByPublicId(f: ProjectKanbanFlowConfigState, id: string) {
    return f.columns.find((c) => c.columnPublicId === id) ?? null
  }
}

const reader = () => minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })
const dev = () => minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
const po = () => minimalWorkspaceMember({ userPublicId: "po", workspaceRoleMethodological: "product_owner" })

function makeBoard(flow: ProjectKanbanFlowConfigState) {
  const repo = new MemRepo()
  const runtime = new FakeRuntime() as never
  const kanbanFlow = new FakeFlow(flow) as never
  const backlog = new KanbanBacklogService(repo, runtime, kanbanFlow, null)
  const board = new KanbanBoardService(repo, runtime, kanbanFlow, backlog, null, null)
  return { repo, board, backlog }
}

describe("KanbanBoardService", () => {
  it("snapshot with itemsPerColumn uses per-column DB limit without full list", async () => {
    const flow = flowTwoCols()
    const { repo, board } = makeBoard(flow)
    const manyA = Array.from({ length: 5 }, (_, i) =>
      item({ title: `A${i}`, kanbanColumnPublicId: colA, sortOrder: i }),
    )
    repo.items = [...manyA, item({ title: "B0", kanbanColumnPublicId: colB, sortOrder: 0 })]
    repo.fullListCalls = 0
    const snap = await board.getBoardSnapshot(reader(), ws, proj, { itemsPerColumn: 2 })
    assert.equal(repo.fullListCalls, 0)
    const colAOut = snap.columns.find((c) => c.columnPublicId === colA)
    assert.equal(colAOut?.cards.length, 2)
    assert.equal(colAOut?.totalItems, 5)
    assert.equal(colAOut?.hasMore, true)
  })

  it("snapshot groups cards by column", async () => {
    const flow = flowTwoCols()
    const { repo, board } = makeBoard(flow)
    const i1 = item({ title: "One", kanbanColumnPublicId: colA, sortOrder: 0 })
    const i2 = item({ title: "Two", kanbanColumnPublicId: colB, sortOrder: 0 })
    repo.items = [i1, i2]
    const snap = await board.getBoardSnapshot(reader(), ws, proj)
    assert.equal(snap.columns.length, 2)
    assert.equal(snap.columns[0]?.cards.length, 1)
    assert.equal(snap.columns[0]?.cards[0]?.backlogItemPublicId, i1.backlogItemPublicId)
    assert.equal(snap.columns[1]?.cards[0]?.columnPublicId, colB)
  })

  it("moves between columns", async () => {
    const flow = flowTwoCols()
    const { repo, board } = makeBoard(flow)
    const i1 = item({ kanbanColumnPublicId: colA })
    repo.items = [i1]
    const out = await board.moveItemToColumn(dev(), ws, proj, i1.backlogItemPublicId, colB)
    assert.equal(out.kanbanColumnPublicId, colB)
  })

  it("move respects WIP (warning) with ack on touch/exceed", async () => {
    const flow = flowTwoCols(1)
    const { repo, board } = makeBoard(flow)
    repo.items = [
      item({ kanbanColumnPublicId: colB, backlogItemPublicId: randomUUID() }),
      item({ kanbanColumnPublicId: colA, backlogItemPublicId: randomUUID() }),
    ]
    const toMove = repo.items[1]!
    await assert.rejects(
      () => board.moveItemToColumn(dev(), ws, proj, toMove.backlogItemPublicId, colB),
      KanbanBoardWipMoveAckRequiredError,
    )
    const ok = await board.moveItemToColumn(dev(), ws, proj, toMove.backlogItemPublicId, colB, {
      allowWipOverride: true,
    })
    assert.equal(ok.kanbanColumnPublicId, colB)
  })

  it("block, patch reason, unblock", async () => {
    const { repo, board } = makeBoard(flowTwoCols())
    const i1 = item({})
    repo.items = [i1]
    let row = await board.blockItem(dev(), ws, proj, i1.backlogItemPublicId, { blockedReason: "wait" })
    assert.equal(row.isBlocked, true)
    assert.equal(row.blockedReason, "wait")
    row = await board.updateBlockedReason(dev(), ws, proj, i1.backlogItemPublicId, "other")
    assert.equal(row.blockedReason, "other")
    row = await board.unblockItem(dev(), ws, proj, i1.backlogItemPublicId)
    assert.equal(row.isBlocked, false)
    assert.equal(row.blockedReason, null)
  })

  it("return to backlog clears column and block", async () => {
    const { repo, board } = makeBoard(flowTwoCols())
    const i1 = item({ isBlocked: true, blockedReason: "x" })
    repo.items = [i1]
    const row = await board.returnItemFromBoardToBacklog(po(), ws, proj, i1.backlogItemPublicId)
    assert.equal(row.kanbanColumnPublicId, null)
    assert.equal(row.isBlocked, false)
    assert.equal(row.blockedReason, null)
  })
})
