import { randomUUID } from "node:crypto"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { acceptanceCriteriaSummaryFromFrozen } from "../../project-scrum-backlog/domain/acceptance-criterion-closure.js"
import { acceptanceCriteriaSummary } from "../../project-scrum-backlog/domain/acceptance-criterion.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { sprintStateToJson } from "../../project-scrum-sprint-planning/services/sprint-planning.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkReadyDoneControlsService } from "../../work-ready-done-controls/services/work-ready-done-controls.service.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { boardColumnToBacklogStatus } from "../domain/board-to-backlog-status.js"
import {
  SprintBoardNotFoundError,
  SprintBoardValidationError,
} from "../domain/sprint-board.errors.js"
import { SPRINT_BOARD_COLUMNS, type SprintBoardColumn } from "../domain/sprint-board-column.js"

export type SprintBoardItemRow = {
  backlogItemPublicId: string
  itemType: string
  title: string
  backlogStatus: string
  boardColumn: SprintBoardColumn
  sprintSortOrder: number
  acceptanceCriteriaSummary: ReturnType<typeof acceptanceCriteriaSummary>
  /** Comentarios no eliminados (soft delete). @see work-item-comments */
  commentsCount: number
}

export type SprintBoardView = {
  sprint: ReturnType<typeof sprintStateToJson>
  columns: readonly string[]
  items: SprintBoardItemRow[]
}

export class SprintBoardService {
  constructor(
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly workControls: WorkReadyDoneControlsService | null = null,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  async startSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (sprint.status !== "ready_for_execution") {
      throw new SprintBoardValidationError(
        "Sprint can only be started from ready_for_execution. Use sprint planning to prepare the sprint.",
      )
    }

    const activeCount = await this.sprintRepo.countSprintsByProjectAndStatus(
      workspacePublicId,
      projectPublicId,
      "active",
    )
    if (activeCount >= 1) {
      throw new SprintBoardValidationError(
        "Another sprint is already active for this project. Close or complete it before starting a new one.",
      )
    }

    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )

    const initialColumn: SprintBoardColumn = "to_do"
    const initialBacklogStatus = boardColumnToBacklogStatus(initialColumn)

    for (const m of memberships) {
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!item) continue
      if (item.itemType !== "user_story" && item.itemType !== "task") {
        continue
      }

      await this.sprintRepo.updateMembershipBoardColumn(
        workspacePublicId,
        projectPublicId,
        sprintPublicId,
        m.backlogItemPublicId,
        initialColumn,
      )

      if (item.status !== initialBacklogStatus) {
        await this.backlogRepo.replace({
          ...item,
          status: initialBacklogStatus,
          updatedAt: new Date(),
        })
      }
    }

    const next: ScrumSprintState = {
      ...sprint,
      status: "active",
      updatedAt: new Date(),
    }
    await this.sprintRepo.replaceSprint(next)

    const updated = await this.sprintRepo.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!updated) {
      throw new Error("sprint_missing_after_start")
    }
    return updated
  }

  async getBoard(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<SprintBoardView> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (sprint.status === "closed") {
      if (!sprint.closure) {
        throw new SprintBoardValidationError("Closed sprint is missing closure snapshot data.")
      }
      const items: SprintBoardItemRow[] = []
      for (const row of sprint.closure.items) {
        const live = await this.backlogRepo.findByProjectAndItemId(
          workspacePublicId,
          projectPublicId,
          row.backlogItemPublicId,
        )
        const summary =
          row.acceptanceCriteriaTotalCount !== undefined &&
          row.acceptanceCriteriaPendingCount !== undefined &&
          row.acceptanceCriteriaDoneCount !== undefined &&
          row.acceptanceCriteriaReviewedCount !== undefined
            ? acceptanceCriteriaSummaryFromFrozen({
                acceptanceCriteriaTotalCount: row.acceptanceCriteriaTotalCount,
                acceptanceCriteriaPendingCount: row.acceptanceCriteriaPendingCount,
                acceptanceCriteriaDoneCount: row.acceptanceCriteriaDoneCount,
                acceptanceCriteriaReviewedCount: row.acceptanceCriteriaReviewedCount,
              })
            : acceptanceCriteriaSummary(live?.acceptanceCriteria ?? [])
        items.push({
          backlogItemPublicId: row.backlogItemPublicId,
          itemType: row.itemType,
          title: row.title,
          backlogStatus: row.backlogStatusAtClosure,
          boardColumn: row.finalBoardColumn,
          sprintSortOrder: row.sprintSortOrder,
          acceptanceCriteriaSummary: summary,
          commentsCount: live?.commentsCount ?? 0,
        })
      }
      return {
        sprint: sprintStateToJson(sprint),
        columns: SPRINT_BOARD_COLUMNS,
        items,
      }
    }

    if (sprint.status !== "active") {
      throw new SprintBoardValidationError(
        "The sprint board is only available while the sprint is active. Start the sprint first.",
      )
    }

    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )

    const items: SprintBoardItemRow[] = []

    for (const m of memberships) {
      const item = await this.backlogRepo.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        m.backlogItemPublicId,
      )
      if (!item) continue
      if (item.itemType !== "user_story" && item.itemType !== "task") {
        continue
      }

      const col: SprintBoardColumn = m.boardColumn ?? "to_do"

      items.push({
        backlogItemPublicId: item.backlogItemPublicId,
        itemType: item.itemType,
        title: item.title,
        backlogStatus: item.status,
        boardColumn: col,
        sprintSortOrder: m.sprintSortOrder,
        acceptanceCriteriaSummary: acceptanceCriteriaSummary(item.acceptanceCriteria),
        commentsCount: item.commentsCount,
      })
    }

    return {
      sprint: sprintStateToJson(sprint),
      columns: SPRINT_BOARD_COLUMNS,
      items,
    }
  }

  /**
   * Mueve un ítem entre columnas del sprint board.
   * Aplica DoR/DoD reutilizando `work-ready-done-controls` (misma semántica que `project-scrum-backlog` al cambiar status).
   * @param workControlsContext — Si se omite, no evalúa controles (tests internos). En HTTP debe pasarse siempre.
   */
  async moveBoardItem(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    targetColumn: SprintBoardColumn,
    workControlsContext?: {
      actor: WorkspaceMemberState
      workControlOverrideToken: string | null
    },
  ): Promise<SprintBoardView> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)

    if (sprint.status !== "active") {
      throw new SprintBoardValidationError("Items can only be moved on the board while the sprint is active.")
    }

    const membership = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )
    if (!membership) {
      throw new SprintBoardNotFoundError("This backlog item is not committed to this sprint.")
    }

    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) {
      throw new SprintBoardNotFoundError("Backlog item not found.")
    }

    if (item.itemType !== "user_story" && item.itemType !== "task") {
      throw new SprintBoardValidationError("Only user_story and task can be moved on the sprint board.")
    }

    const nextStatus = boardColumnToBacklogStatus(targetColumn)
    const now = new Date()
    if (this.workControls && workControlsContext) {
      const token = workControlsContext.workControlOverrideToken
      if (nextStatus === "in_progress" && item.status !== "in_progress") {
        await this.workControls.assertMayTransitionScrumToInProgress({
          workspacePublicId,
          projectPublicId,
          current: item,
          actor: workControlsContext.actor,
          overrideToken: token,
        })
      }
      if (nextStatus === "done" && item.status !== "done") {
        await this.workControls.assertMayCloseScrumItemToDone({
          workspacePublicId,
          projectPublicId,
          current: item,
          actor: workControlsContext.actor,
          overrideToken: token,
        })
      }
    }

    const previousColumn = membership.boardColumn ?? "to_do"
    await this.sprintRepo.updateMembershipBoardColumn(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
      targetColumn,
    )

    if (item.status !== nextStatus) {
      await this.backlogRepo.replace({
        ...item,
        status: nextStatus,
        updatedAt: now,
      })
    }

    if (this.auditLogRepository && workControlsContext && previousColumn !== targetColumn) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "scrum_sprint_board_item",
        action: "moved_between_columns",
        actorUserPublicId: workControlsContext.actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { sprintPublicId, boardColumn: previousColumn },
        nextValue: { sprintPublicId, boardColumn: targetColumn, backlogStatus: nextStatus },
      })
    }

    if (this.workActivityNotifications && workControlsContext && previousColumn !== targetColumn) {
      const opId = randomUUID()
      if (item.status !== nextStatus) {
        void this.workActivityNotifications
          .onScrumLikeStatusChanged({
            workspacePublicId,
            projectPublicId,
            workItemPublicId: backlogItemPublicId,
            itemTitle: item.title,
            assigneeUserPublicId: item.assignedUserPublicId,
            previousStatus: item.status,
            nextStatus,
            actorUserPublicId: workControlsContext.actor.userPublicId,
            operationDedupeId: opId,
            sprintPublicId,
            boardColumnPublicId: targetColumn,
            at: now,
            columnSummary: null,
          })
          .catch((e) => {
            console.error("[work-activity-notifications] fanout failed", e)
          })
      } else {
        void this.workActivityNotifications
          .onSprintBoardColumnMovedWithoutStatusChange({
            workspacePublicId,
            projectPublicId,
            sprintPublicId,
            workItemPublicId: backlogItemPublicId,
            itemTitle: item.title,
            assigneeUserPublicId: item.assignedUserPublicId,
            actorUserPublicId: workControlsContext.actor.userPublicId,
            previousColumn,
            targetColumn,
            backlogStatus: item.status,
            operationDedupeId: opId,
            at: now,
          })
          .catch((e) => {
            console.error("[work-activity-notifications] fanout failed", e)
          })
      }
    }

    return this.getBoard(workspacePublicId, projectPublicId, sprintPublicId)
  }

  /**
   * Reordena un ítem dentro de la **misma** columna del sprint (no cambia `boardColumn` ni `status` del backlog).
   * `sprintSortOrder` es un orden **global** en el sprint: se reescribe mezclando el nuevo orden de la columna
   * con el resto de filas sin alterar su orden relativo.
   */
  async reorderItemWithinColumn(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    boardColumn: SprintBoardColumn,
    placedBeforeBacklogItemPublicId: string | null,
    auditContext: { actor: WorkspaceMemberState } | null,
  ): Promise<SprintBoardView> {
    await this.projectRuntimeService.requireScrumWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const sprint = await this.requireSprint(workspacePublicId, projectPublicId, sprintPublicId)
    if (sprint.status !== "active") {
      throw new SprintBoardValidationError("Items can only be reordered on the board while the sprint is active.")
    }
    const membership = await this.sprintRepo.findMembership(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      backlogItemPublicId,
    )
    if (!membership) {
      throw new SprintBoardNotFoundError("This backlog item is not committed to this sprint.")
    }
    const currentCol = membership.boardColumn ?? "to_do"
    if (currentCol !== boardColumn) {
      throw new SprintBoardValidationError("Item is not in the given board column; use move to change column.")
    }

    const all = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    const inCol = all.filter((m) => (m.boardColumn ?? "to_do") === boardColumn)
    const orderedIds = inCol.map((m) => m.backlogItemPublicId)
    if (!orderedIds.includes(backlogItemPublicId)) {
      throw new SprintBoardNotFoundError("This backlog item is not committed to this sprint.")
    }
    const without = orderedIds.filter((id) => id !== backlogItemPublicId)
    let insertAt = without.length
    if (placedBeforeBacklogItemPublicId !== null) {
      const idx = without.indexOf(placedBeforeBacklogItemPublicId)
      if (idx === -1) {
        throw new SprintBoardValidationError(
          "placed_before_backlog_item_public_id is not in this column or is the item being moved.",
        )
      }
      insertAt = idx
    }
    const inColumnNew = [...without.slice(0, insertAt), backlogItemPublicId, ...without.slice(insertAt)]
    if (inColumnNew.length === orderedIds.length && inColumnNew.every((id, i) => id === orderedIds[i])) {
      return this.getBoard(workspacePublicId, projectPublicId, sprintPublicId)
    }
    const merged: string[] = []
    let colEmitted = false
    for (const m of all) {
      const c = m.boardColumn ?? "to_do"
      if (c === boardColumn) {
        if (!colEmitted) {
          merged.push(...inColumnNew)
          colEmitted = true
        }
      } else {
        merged.push(m.backlogItemPublicId)
      }
    }
    const updates = merged.map((id, sprintSortOrder) => ({ backlogItemPublicId: id, sprintSortOrder }))
    await this.sprintRepo.bulkSetMembershipSprintSortOrders(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
      updates,
    )
    const now = new Date()
    if (this.auditLogRepository && auditContext) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "scrum_sprint_board_item",
        action: "reordered_in_column",
        actorUserPublicId: auditContext.actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: { sprintPublicId, boardColumn, order: orderedIds },
        nextValue: { sprintPublicId, boardColumn, order: inColumnNew },
      })
    }
    return this.getBoard(workspacePublicId, projectPublicId, sprintPublicId)
  }

  private async requireSprint(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState> {
    const s = await this.sprintRepo.findSprintByPublicId(workspacePublicId, projectPublicId, sprintPublicId)
    if (!s) {
      throw new SprintBoardNotFoundError("Sprint not found.")
    }
    return s
  }
}
