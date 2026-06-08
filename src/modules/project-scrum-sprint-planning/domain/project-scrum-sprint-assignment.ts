import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"

export type ProjectScrumSprintAssignmentState = {
  sprintPublicId: string
  backlogItemPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintSortOrder: number
  committedAt: Date
  committedByUserPublicId: string
  /** Columna del sprint board; `null` hasta que el sprint pasa a `active` y se inicializa. */
  boardColumn: SprintBoardColumn | null
}
