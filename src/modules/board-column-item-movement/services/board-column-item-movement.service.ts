import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { KanbanBoardService } from "../../project-kanban-board/services/kanban-board.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { isSprintBoardColumn, type SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import type { SprintBoardService } from "../../project-scrum-sprint-board/services/sprint-board.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { BoardColumnMismatchError, BoardItemMoveContextError } from "../domain/board-column-item-movement.errors.js"

export type BoardItemMoveResult =
  | { outcome: "no_op"; operational_approach: "scrum" | "kanban" }
  | {
      outcome: "moved"
      operational_approach: "scrum"
      sprint_board: Awaited<ReturnType<SprintBoardService["getBoard"]>>
    }
  | {
      outcome: "moved"
      operational_approach: "kanban"
      work_item: Awaited<ReturnType<KanbanBoardService["moveItemToColumn"]>>
    }

export type BoardItemReorderResult =
  | { outcome: "no_op"; operational_approach: "scrum" | "kanban" }
  | {
      outcome: "reordered"
      operational_approach: "scrum"
      sprint_board: Awaited<ReturnType<SprintBoardService["getBoard"]>>
    }
  | {
      outcome: "reordered"
      operational_approach: "kanban"
      work_item: Awaited<ReturnType<KanbanBoardService["reorderItemWithinColumn"]>>
    }

export class BoardColumnItemMovementService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly sprintBoardService: SprintBoardService,
    private readonly kanbanBoardService: KanbanBoardService,
  ) {}

  async move(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    input: {
      sprintPublicId?: string
      fromColumnPublicId: string
      toColumnPublicId: string
      allowWipOverride?: boolean
      kanbanWipMoveAck?: boolean
      kanbanWipOverrideReason?: string | null
    },
    workControlOverrideToken: string | null,
  ): Promise<BoardItemMoveResult> {
    const project = await this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(
      workspacePublicId,
      projectPublicId,
    )
    const approach = project.operationalApproach

    if (approach === "scrum") {
      if (!input.sprintPublicId) {
        throw new BoardItemMoveContextError("sprint_public_id is required for scrum projects.")
      }
      if (!isSprintBoardColumn(input.fromColumnPublicId) || !isSprintBoardColumn(input.toColumnPublicId)) {
        throw new BoardItemMoveContextError(
          "Scrum move requires from_column_public_id and to_column_public_id to be sprint board column ids (to_do, in_progress, in_review, done).",
        )
      }
      return this.moveScrum(
        actor,
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
        input.sprintPublicId,
        input.fromColumnPublicId,
        input.toColumnPublicId,
        workControlOverrideToken,
      )
    }

    if (approach === "kanban") {
      if (input.sprintPublicId) {
        throw new BoardItemMoveContextError("sprint_public_id must not be sent for kanban projects.")
      }
      return this.moveKanban(
        actor,
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
        input.fromColumnPublicId,
        input.toColumnPublicId,
        input,
        workControlOverrideToken,
      )
    }

    throw new BoardItemMoveContextError("Unsupported operational approach for board item move.")
  }

  private async moveScrum(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    sprintPublicId: string,
    fromCol: SprintBoardColumn,
    toCol: SprintBoardColumn,
    workControlOverrideToken: string | null,
  ): Promise<BoardItemMoveResult> {
    const membership = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      workItemPublicId,
    )
    if (!membership) {
      throw new BoardItemMoveContextError("This work item is not in the given sprint or was not found.")
    }
    const current = (membership.boardColumn ?? "to_do") as SprintBoardColumn
    if (current !== fromCol) {
      throw new BoardColumnMismatchError()
    }
    if (fromCol === toCol) {
      return { outcome: "no_op", operational_approach: "scrum" }
    }
    const view = await this.sprintBoardService.moveBoardItem(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      workItemPublicId,
      toCol,
      { actor, workControlOverrideToken },
    )
    return { outcome: "moved", operational_approach: "scrum", sprint_board: view }
  }

  private async moveKanban(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    fromColumnPublicId: string,
    toColumnPublicId: string,
    input: {
      allowWipOverride?: boolean
      kanbanWipMoveAck?: boolean
      kanbanWipOverrideReason?: string | null
    },
    workControlOverrideToken: string | null,
  ): Promise<BoardItemMoveResult> {
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    if (!this.kanbanFlowService.findColumnByPublicId(flow, fromColumnPublicId)) {
      throw new BoardItemMoveContextError("from_column_public_id is not a column in this Kanban flow.")
    }
    if (!this.kanbanFlowService.findColumnByPublicId(flow, toColumnPublicId)) {
      throw new BoardItemMoveContextError("to_column_public_id is not a column in this Kanban flow.")
    }
    if (fromColumnPublicId === toColumnPublicId) {
      return { outcome: "no_op", operational_approach: "kanban" }
    }
    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!item) {
      throw new BoardItemMoveContextError("Work item not found.")
    }
    if (item.kanbanColumnPublicId === null) {
      throw new BoardItemMoveContextError("Item is not on the Kanban board. Release it to the flow first.")
    }
    if (item.kanbanColumnPublicId !== fromColumnPublicId) {
      throw new BoardColumnMismatchError()
    }
    const persisted = await this.kanbanBoardService.moveItemToColumn(
      actor,
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
      toColumnPublicId,
      {
        allowWipOverride: input.allowWipOverride,
        kanbanWipMoveAck: input.kanbanWipMoveAck,
        kanbanWipOverrideReason: input.kanbanWipOverrideReason ?? null,
        workControlOverrideToken,
      },
    )
    return { outcome: "moved", operational_approach: "kanban", work_item: persisted }
  }

  async reorder(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    input: {
      sprintPublicId?: string
      columnPublicId: string
      placedBeforeBacklogItemPublicId: string | null | undefined
    },
  ): Promise<BoardItemReorderResult> {
    const project = await this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(
      workspacePublicId,
      projectPublicId,
    )
    const approach = project.operationalApproach
    const beforeId =
      input.placedBeforeBacklogItemPublicId === undefined ? null : input.placedBeforeBacklogItemPublicId

    if (approach === "scrum") {
      if (!input.sprintPublicId) {
        throw new BoardItemMoveContextError("sprint_public_id is required for scrum projects.")
      }
      if (!isSprintBoardColumn(input.columnPublicId)) {
        throw new BoardItemMoveContextError("column_public_id must be a sprint board column id for scrum projects.")
      }
      const view = await this.sprintBoardService.reorderItemWithinColumn(
        workspacePublicId,
        projectPublicId,
        input.sprintPublicId,
        workItemPublicId,
        input.columnPublicId,
        beforeId,
        { actor },
      )
      return { outcome: "reordered", operational_approach: "scrum", sprint_board: view }
    }

    if (approach === "kanban") {
      if (input.sprintPublicId) {
        throw new BoardItemMoveContextError("sprint_public_id must not be sent for kanban projects.")
      }
      const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
      if (!this.kanbanFlowService.findColumnByPublicId(flow, input.columnPublicId)) {
        throw new BoardItemMoveContextError("column_public_id is not a column in this Kanban flow.")
      }
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
      )
      if (!item) {
        throw new BoardItemMoveContextError("Work item not found.")
      }
      if (item.kanbanColumnPublicId === null) {
        throw new BoardItemMoveContextError("Item is not on the Kanban board.")
      }
      if (item.kanbanColumnPublicId !== input.columnPublicId) {
        throw new BoardItemMoveContextError("column_public_id does not match the item's current column.")
      }
      const reordered = await this.kanbanBoardService.reorderItemWithinColumn(
        actor,
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
        input.columnPublicId,
        beforeId,
      )
      return { outcome: "reordered", operational_approach: "kanban", work_item: reordered }
    }

    throw new BoardItemMoveContextError("Unsupported operational approach for board item reorder.")
  }
}