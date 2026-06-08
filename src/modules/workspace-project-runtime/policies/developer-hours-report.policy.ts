import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"

/**
 * Informe de horas de desarrolladores: SM, PO, coach, admin, operator, auditor.
 * Excluye explícitamente `scrum_developer`.
 */
export function assertCanViewDeveloperHoursReport(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectRuntimeForbiddenError("Deactivated members cannot view developer hours reports.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }
  if (mr === "scrum_master" || mr === "product_owner" || mr === "agility_lead" || mr === "scrum_coach") {
    return
  }
  throw new ProjectRuntimeForbiddenError("You are not allowed to view this developer hours report.")
}
