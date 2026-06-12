import type { Prisma } from "@prisma/client"
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

/** Cláusula Prisma AND-compatible para los mismos filtros de asignación del listado. */
export function buildWorkItemAssignmentListWhere(
  actor: WorkspaceMemberState,
  filter: WorkItemAssignmentListFilter | undefined,
): Prisma.WorkItemWhereInput {
  if (!filter) return {}
  const and: Prisma.WorkItemWhereInput[] = []
  if (filter.unassigned === true) {
    and.push({ assigned_user_public_id: null })
  }
  if (filter.assignee === "me") {
    and.push({ assigned_user_public_id: actor.userPublicId })
  }
  if (filter.assigneeUserPublicId) {
    and.push({ assigned_user_public_id: filter.assigneeUserPublicId })
  }
  return and.length > 0 ? { AND: and } : {}
}
