export const WORK_ITEM_ASSIGNMENT_CHANGE_TYPES = [
  "assigned",
  "reassigned",
  "unassigned",
  "self_assigned",
  "self_unassigned",
] as const

export type WorkItemAssignmentChangeType = (typeof WORK_ITEM_ASSIGNMENT_CHANGE_TYPES)[number]

export function isWorkItemAssignmentChangeType(v: string): v is WorkItemAssignmentChangeType {
  return (WORK_ITEM_ASSIGNMENT_CHANGE_TYPES as readonly string[]).includes(v)
}
