import type { WorkItemAssignmentChangeType } from "./work-item-assignment-change-type.js"

export type WorkItemAssignmentHistoryEvent = {
  assignmentEventId: string
  changedAt: Date
  changedByUserPublicId: string
  previousAssignedUserPublicId: string | null
  newAssignedUserPublicId: string | null
  changeType: WorkItemAssignmentChangeType
}
