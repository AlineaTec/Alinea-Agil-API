import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import type { ProjectScrumSprintAssignmentState } from "../domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintState } from "../domain/scrum-sprint.js"
import type { ScrumSprintStatus } from "../domain/sprint-status.js"

export type ScrumSprintPlanningRepository = {
  insertSprint(state: ScrumSprintState): Promise<void>
  replaceSprint(state: ScrumSprintState): Promise<void>
  findSprintByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState | null>
  listSprintsByProject(workspacePublicId: string, projectPublicId: string): Promise<ScrumSprintState[]>
  countSprintsByProjectAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    status: ScrumSprintStatus,
  ): Promise<number>
  countSprintsByProjectAndStatusExcludingSprint(
    workspacePublicId: string,
    projectPublicId: string,
    status: ScrumSprintStatus,
    excludeSprintPublicId: string,
  ): Promise<number>

  insertMembership(state: ProjectScrumSprintAssignmentState): Promise<void>
  deleteMembership(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
  ): Promise<void>
  listMembershipsBySprintOrdered(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState[]>
  findMembership(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState | null>
  maxSprintSortOrder(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<number>
  listMembershipRowsForBacklogItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState[]>

  /** Actualiza solo `boardColumn` en la membresía (sprint board). */
  updateMembershipBoardColumn(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    boardColumn: SprintBoardColumn,
  ): Promise<void>

  /** Reordenar ítems en sprint: actualiza `sprintSortOrder` en lote. */
  bulkSetMembershipSprintSortOrders(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    updates: Array<{ backlogItemPublicId: string; sprintSortOrder: number }>,
  ): Promise<void>
}
