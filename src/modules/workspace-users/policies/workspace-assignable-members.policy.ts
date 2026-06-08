import type { WorkspaceMemberState } from "../domain/workspace-member.js"
import { WorkspaceUsersForbiddenError } from "./workspace-users-authorization.policy.js"

/**
 * Misma franja que `assertCanCoordinateWorkItemAssignment` (work-item-assignment):
 * quien puede asignar a terceros puede listar candidatos para el selector.
 */
export function assertCanListAssignableMembersForWorkItems(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkspaceUsersForbiddenError("Deactivated members cannot list assignable workspace members.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") {
    return
  }

  throw new WorkspaceUsersForbiddenError(
    "Only admin, operator, agility_lead, scrum_master, or product_owner may list assignable members.",
  )
}
