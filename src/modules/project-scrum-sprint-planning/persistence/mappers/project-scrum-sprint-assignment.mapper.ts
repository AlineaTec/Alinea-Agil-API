import type { ProjectScrumSprintAssignmentState } from "../../domain/project-scrum-sprint-assignment.js"
import type { ProjectScrumSprintAssignmentDocProps } from "../schemas/project-scrum-sprint-assignment.schema.js"
import {
  isSprintBoardColumn,
  type SprintBoardColumn,
} from "../../../project-scrum-sprint-board/domain/sprint-board-column.js"

function parseBoardColumn(raw: unknown): SprintBoardColumn | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string" && isSprintBoardColumn(raw)) return raw
  return null
}

export function docToProjectScrumSprintAssignmentState(doc: ProjectScrumSprintAssignmentDocProps): ProjectScrumSprintAssignmentState {
  return {
    sprintPublicId: doc.sprintPublicId,
    backlogItemPublicId: doc.backlogItemPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    sprintSortOrder: doc.sprintSortOrder,
    committedAt: doc.committedAt,
    committedByUserPublicId: doc.committedByUserPublicId,
    boardColumn: parseBoardColumn(doc.boardColumn),
  }
}
