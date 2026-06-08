import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { WorkItemAssignmentForbiddenError } from "../domain/work-item-assignment.errors.js"

/**
 * Lectura de asignación e historial: coordinación, ejecutor, auditor, coach
 * (alineado a project-work-assignment / contracts).
 */
export function assertCanReadWorkItemAssignment(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkItemAssignmentForbiddenError("Deactivated members cannot view work item assignment.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_coach" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }

  throw new WorkItemAssignmentForbiddenError(
    "You do not have permission to view assignment for this work item.",
  )
}

export function isWorkItemAssignmentCoordinator(actor: WorkspaceMemberState): boolean {
  if (actor.status === "deactivated") return false
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") return true
  return false
}

/** Asignar a terceros, reasignar y desasignar (coordinación). */
export function assertCanCoordinateWorkItemAssignment(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkItemAssignmentForbiddenError("Deactivated members cannot change work item assignment.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") {
    return
  }

  throw new WorkItemAssignmentForbiddenError(
    "Only admin, operator, agility_lead, scrum_master, or product_owner may assign or reassign work items.",
  )
}

/** Autoasignación y desasignación propia (ejecutor Scrum en MVP). */
export function assertCanSelfAssignWorkItem(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkItemAssignmentForbiddenError("Deactivated members cannot self-assign work items.")
  }

  if (actor.workspaceRoleMethodological === "scrum_developer") {
    return
  }

  throw new WorkItemAssignmentForbiddenError(
    "Only scrum_developer may self-assign or self-unassign in this phase.",
  )
}
