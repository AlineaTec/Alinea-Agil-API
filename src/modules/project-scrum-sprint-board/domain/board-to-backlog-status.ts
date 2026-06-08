import type { ScrumBacklogItemStatus } from "../../project-scrum-backlog/domain/backlog-item-status.js"
import type { SprintBoardColumn } from "./sprint-board-column.js"

/** Mapeo cerrado contracts-docs: columna board → `status` del product backlog. */
export function boardColumnToBacklogStatus(column: SprintBoardColumn): ScrumBacklogItemStatus {
  switch (column) {
    case "to_do":
      return "open"
    case "in_progress":
    case "in_review":
      return "in_progress"
    case "done":
      return "done"
  }
}
