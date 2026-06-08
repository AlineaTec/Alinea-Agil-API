import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"

/**
 * Informe agregado de sesiones de planning guiado: mismos roles que el informe de refinamiento / review / daily.
 */
export function assertCanViewGuidedSprintPlanningSessionsReport(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectRuntimeForbiddenError("Deactivated members cannot view guided sprint planning sessions reports.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }
  if (mr === "scrum_master" || mr === "product_owner" || mr === "agility_lead" || mr === "scrum_coach") {
    return
  }
  throw new ProjectRuntimeForbiddenError("You are not allowed to view this guided sprint planning sessions report.")
}
