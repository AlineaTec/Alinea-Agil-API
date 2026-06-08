import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"

/**
 * Informe agregado de sesiones de review guiado: mismos roles que el informe de refinamiento / daily.
 */
export function assertCanViewGuidedReviewSessionsReport(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectRuntimeForbiddenError("Deactivated members cannot view guided review sessions reports.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }
  if (mr === "scrum_master" || mr === "product_owner" || mr === "agility_lead" || mr === "scrum_coach") {
    return
  }
  throw new ProjectRuntimeForbiddenError("You are not allowed to view this guided review sessions report.")
}
