import { WORK_ITEM_ASSIGNMENT_CHANGE_TYPES } from "../../../work-item-assignment/domain/work-item-assignment-change-type.js"
import { ACCEPTANCE_CRITERION_STATUSES } from "../../domain/acceptance-criterion-status.js"
import { SCRUM_BACKLOG_ITEM_STATUSES } from "../../domain/backlog-item-status.js"
import { SCRUM_BACKLOG_ITEM_TYPES } from "../../domain/backlog-item-type.js"
import { SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS } from "../../domain/backlog-item-priority-level.js"

export interface ScrumBacklogItemDocProps {
  backlogItemPublicId: string
  workspacePublicId: string
  projectPublicId: string
  itemType: (typeof SCRUM_BACKLOG_ITEM_TYPES)[number]
  title: string
  description: string
  status: (typeof SCRUM_BACKLOG_ITEM_STATUSES)[number]
  sortOrder: number
  parentItemPublicId: string | null
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  completedInSprintPublicId?: string | null
  assignedUserPublicId?: string | null
  assignmentUpdatedAt?: Date | null
  assignmentUpdatedByUserPublicId?: string | null
  assignmentHistory?: Array<{
    assignmentEventId: string
    changedAt: Date
    changedByUserPublicId: string
    previousAssignedUserPublicId: string | null
    newAssignedUserPublicId: string | null
    changeType: (typeof WORK_ITEM_ASSIGNMENT_CHANGE_TYPES)[number]
  }>
  storyPoints?: number | null
  priorityLevel?: (typeof SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS)[number]
  acceptanceCriteria?: Array<{
    acceptanceCriterionPublicId: string
    text: string
    status: (typeof ACCEPTANCE_CRITERION_STATUSES)[number]
    createdAt: Date
    updatedAt: Date
  }>
  commentsCount?: number
  /** Kanban: backlog vs columna de flujo. Scrum: null. */
  kanbanColumnPublicId?: string | null
  isBlocked?: boolean
  blockedReason?: string | null
}
