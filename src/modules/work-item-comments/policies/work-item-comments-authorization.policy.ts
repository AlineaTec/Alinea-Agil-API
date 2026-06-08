import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"
import { assertCanReadSprintBoard, assertCanMutateSprintBoard } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import { WorkItemCommentsForbiddenError } from "../domain/work-item-comments.errors.js"

function tryReadBacklog(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadScrumBacklog(actor)
    return true
  } catch {
    return false
  }
}

function tryReadBoard(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadSprintBoard(actor)
    return true
  } catch {
    return false
  }
}

/**
 * Lectura de comentarios: unión de quien puede leer backlog y quien puede leer board
 * (contracts-docs work-item-comments + project-scrum-permissions).
 */
export function assertCanReadWorkItemComments(actor: WorkspaceMemberState): void {
  if (tryReadBacklog(actor) || tryReadBoard(actor)) {
    return
  }
  throw new WorkItemCommentsForbiddenError(
    "You do not have permission to read work item comments for this project.",
  )
}

/**
 * Crear / editar propio / eliminar propio. Excluye auditor y scrum_coach (solo lectura de comentarios).
 */
export function assertCanMutateOwnWorkItemComment(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkItemCommentsForbiddenError("Deactivated members cannot comment on work items.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "auditor") {
    throw new WorkItemCommentsForbiddenError("Auditor role is read-only for work item comments.")
  }

  if (mr === "scrum_coach") {
    throw new WorkItemCommentsForbiddenError("Scrum coach role is read-only for work item comments.")
  }

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }

  throw new WorkItemCommentsForbiddenError(
    "You do not have permission to add or edit your own comments on this work item.",
  )
}

/**
 * Moderación: eliminar comentario ajeno (misma franja que mutación del sprint board).
 */
export function assertCanModerateWorkItemComments(actor: WorkspaceMemberState): void {
  assertCanMutateSprintBoard(actor)
}
