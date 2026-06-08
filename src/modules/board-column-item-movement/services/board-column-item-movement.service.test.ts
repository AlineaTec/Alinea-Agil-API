import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { BoardColumnMismatchError, BoardItemMoveContextError } from "../domain/board-column-item-movement.errors.js"
import { BoardColumnItemMovementService } from "./board-column-item-movement.service.js"
import type { ProjectScrumSprintAssignmentState } from "../../project-scrum-sprint-planning/domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { KanbanBoardService } from "../../project-kanban-board/services/kanban-board.service.js"
import type { SprintBoardService } from "../../project-scrum-sprint-board/services/sprint-board.service.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "00000000-0000-4000-8000-000000000002"
const sprint = "00000000-0000-4000-8000-0000000000s1"
const colA = "00000000-0000-4000-8000-0000000000a1"
const colB = "00000000-0000-4000-8000-0000000000b2"
const itemId = "00000000-0000-4000-8000-0000000000i1"

class FakeProjectRuntime implements Pick<ProjectRuntimeService, "requireScrumOrKanbanWorkspaceRuntimeProject"> {
  approach: "scrum" | "kanban" = "scrum"
  async requireScrumOrKanbanWorkspaceRuntimeProject(): Promise<WorkspaceRuntimeProjectState> {
    return {
      projectPublicId: proj,
      workspacePublicId: ws,
      sourceDraftPublicId: "d",
      projectName: "P",
      operationalApproach: this.approach,
      initialConfigurationSummary: { managementApproach: "scrum" } as never,
      status: "active",
      materializedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
}

class FakeSprintRepo implements Pick<ScrumSprintPlanningRepository, "findMembership"> {
  membership: ProjectScrumSprintAssignmentState | null = {
    sprintPublicId: sprint,
    backlogItemPublicId: itemId,
    workspacePublicId: ws,
    projectPublicId: proj,
    sprintSortOrder: 0,
    committedAt: new Date(),
    committedByUserPublicId: "u",
    boardColumn: "to_do",
  }

  async findMembership(): Promise<ProjectScrumSprintAssignmentState | null> {
    return this.membership
  }
}

class FakeBacklog implements Pick<ScrumBacklogRepository, "findByProjectAndItemId"> {
  item: ScrumBacklogItemState | null = null
  async findByProjectAndItemId(): Promise<ScrumBacklogItemState | null> {
    return this.item
  }
}

const flow: ProjectKanbanFlowConfigState = {
  workspacePublicId: ws,
  projectPublicId: proj,
  entryColumnPublicId: colA,
  wipNearThresholdRatio: 0.8,
  columns: [
    { columnPublicId: colA, name: "A", position: 0, wipLimit: null, policyText: "", wipEnforcement: "informational" },
    { columnPublicId: colB, name: "B", position: 1, wipLimit: null, policyText: "", wipEnforcement: "informational" },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
}

class FakeFlow implements Pick<KanbanFlowService, "getFlowConfigOrThrow" | "findColumnByPublicId"> {
  async getFlowConfigOrThrow(): Promise<ProjectKanbanFlowConfigState> {
    return flow
  }
  findColumnByPublicId(f: ProjectKanbanFlowConfigState, id: string) {
    return f.columns.find((c) => c.columnPublicId === id) ?? null
  }
}

describe("BoardColumnItemMovementService", () => {
  it("scrum: throws BoardColumnMismatchError when from column does not match server", async () => {
    const projectRuntime = new FakeProjectRuntime()
    const sprintRepo = new FakeSprintRepo()
    const backlog = new FakeBacklog()
    const flowSvc = new FakeFlow() as unknown as KanbanFlowService
    const sprintBoard = { moveBoardItem: async () => ({}) } as unknown as SprintBoardService
    const kanbanBoard = { moveItemToColumn: async () => ({}) } as unknown as KanbanBoardService
    const svc = new BoardColumnItemMovementService(
      projectRuntime as unknown as ProjectRuntimeService,
      sprintRepo as unknown as ScrumSprintPlanningRepository,
      backlog as unknown as ScrumBacklogRepository,
      flowSvc,
      sprintBoard,
      kanbanBoard,
    )
    const actor = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
    await assert.rejects(
      () =>
        svc.move(actor, ws, proj, itemId, {
          sprintPublicId: sprint,
          fromColumnPublicId: "in_progress",
          toColumnPublicId: "in_review",
        }, null),
      BoardColumnMismatchError,
    )
  })

  it("scrum: no_op when from and to are equal", async () => {
    const projectRuntime = new FakeProjectRuntime()
    const sprintRepo = new FakeSprintRepo()
    const backlog = new FakeBacklog()
    const flowSvc = new FakeFlow() as unknown as KanbanFlowService
    const sprintBoard = { moveBoardItem: async () => {
      throw new Error("should not be called")
    } } as unknown as SprintBoardService
    const kanbanBoard = {} as unknown as KanbanBoardService
    const svc = new BoardColumnItemMovementService(
      projectRuntime as unknown as ProjectRuntimeService,
      sprintRepo as unknown as ScrumSprintPlanningRepository,
      backlog as unknown as ScrumBacklogRepository,
      flowSvc,
      sprintBoard,
      kanbanBoard,
    )
    const actor = minimalWorkspaceMember({})
    const r = await svc.move(
      actor,
      ws,
      proj,
      itemId,
      { sprintPublicId: sprint, fromColumnPublicId: "to_do", toColumnPublicId: "to_do" },
      null,
    )
    assert.equal(r.outcome, "no_op")
    assert.equal(r.operational_approach, "scrum")
  })

  it("kanban: mismatch from vs item throws BoardColumnMismatchError", async () => {
    const projectRuntime = new FakeProjectRuntime()
    projectRuntime.approach = "kanban"
    const sprintRepo = new FakeSprintRepo()
    const backlog = new FakeBacklog()
    const now = new Date()
    backlog.item = {
      backlogItemPublicId: itemId,
      workspacePublicId: ws,
      projectPublicId: proj,
      itemType: "user_story",
      title: "T",
      description: "",
      status: "in_progress",
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
    }
    const flowSvc = new FakeFlow() as unknown as KanbanFlowService
    const sprintBoard = {} as unknown as SprintBoardService
    const kanbanBoard = { moveItemToColumn: async () => {
      throw new Error("no")
    } } as unknown as KanbanBoardService
    const svc = new BoardColumnItemMovementService(
      projectRuntime as unknown as ProjectRuntimeService,
      sprintRepo as unknown as ScrumSprintPlanningRepository,
      backlog as unknown as ScrumBacklogRepository,
      flowSvc,
      sprintBoard,
      kanbanBoard,
    )
    const actor = minimalWorkspaceMember({})
    await assert.rejects(
      () =>
        svc.move(
          actor,
          ws,
          proj,
          itemId,
          { fromColumnPublicId: colB, toColumnPublicId: colA },
          null,
        ),
      BoardColumnMismatchError,
    )
  })

  it("scrum: requires sprint_public_id", async () => {
    const projectRuntime = new FakeProjectRuntime()
    const sprintRepo = new FakeSprintRepo()
    const backlog = new FakeBacklog()
    const flowSvc = new FakeFlow() as unknown as KanbanFlowService
    const svc = new BoardColumnItemMovementService(
      projectRuntime as unknown as ProjectRuntimeService,
      sprintRepo as unknown as ScrumSprintPlanningRepository,
      backlog as unknown as ScrumBacklogRepository,
      flowSvc,
      {} as SprintBoardService,
      {} as KanbanBoardService,
    )
    const actor = minimalWorkspaceMember({})
    await assert.rejects(
      () =>
        svc.move(
          actor,
          ws,
          proj,
          randomUUID(),
          { fromColumnPublicId: "to_do", toColumnPublicId: "in_progress" },
          null,
        ),
      BoardItemMoveContextError,
    )
  })
})
