import type { WorkItemAssignmentHistoryEvent } from "../../work-item-assignment/domain/work-item-assignment-history-event.js"
import type { ScrumBacklogItemPriorityLevel } from "./backlog-item-priority-level.js"
import type { ScrumBacklogItemStatus } from "./backlog-item-status.js"
import type { ScrumBacklogItemType } from "./backlog-item-type.js"
import type { AcceptanceCriterionState } from "./acceptance-criterion.js"

/**
 * Estado persistido de un ítem en el product backlog (Scrum / Kanban comparten almacenamiento).
 */
export type ScrumBacklogItemState = {
  backlogItemPublicId: string
  workspacePublicId: string
  projectPublicId: string
  itemType: ScrumBacklogItemType
  title: string
  description: string
  status: ScrumBacklogItemStatus
  sortOrder: number
  parentItemPublicId: string | null
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  completedInSprintPublicId: string | null
  assignedUserPublicId: string | null
  assignmentUpdatedAt: Date | null
  assignmentUpdatedByUserPublicId: string | null
  assignmentHistory: WorkItemAssignmentHistoryEvent[]
  storyPoints: number | null
  priorityLevel: ScrumBacklogItemPriorityLevel
  acceptanceCriteria: AcceptanceCriterionState[]
  commentsCount: number
  kanbanColumnPublicId: string | null
  isBlocked: boolean
  blockedReason: string | null
}
