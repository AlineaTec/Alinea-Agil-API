import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"

/**
 * Informe de sesiones de alineación diaria: mismos roles que el informe de horas de desarrollo.
 */
export function assertCanViewAlignmentSessionsReport(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectRuntimeForbiddenError("Deactivated members cannot view alignment sessions reports.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }
  if (mr === "scrum_master" || mr === "product_owner" || mr === "agility_lead" || mr === "scrum_coach") {
    return
  }
  throw new ProjectRuntimeForbiddenError("You are not allowed to view this alignment sessions report.")
}
