import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

export type WorkItemAssignmentListFilter = {
  unassigned?: boolean
  assignee?: "me"
  assigneeUserPublicId?: string
}

/**
 * Filtros AND entre sí (misma convención que query `unassigned` + `assignee` + `assigneeUserPublicId`).
 */
export function applyWorkItemAssignmentListFilter<T extends { assignedUserPublicId: string | null }>(
  items: T[],
  actor: WorkspaceMemberState,
  filter: WorkItemAssignmentListFilter | undefined,
): T[] {
  if (!filter) return items
  let result = items
  if (filter.unassigned === true) {
    result = result.filter((i) => i.assignedUserPublicId === null)
  }
  if (filter.assignee === "me") {
    result = result.filter((i) => i.assignedUserPublicId === actor.userPublicId)
  }
  if (filter.assigneeUserPublicId) {
    result = result.filter((i) => i.assignedUserPublicId === filter.assigneeUserPublicId)
  }
  return result
}
