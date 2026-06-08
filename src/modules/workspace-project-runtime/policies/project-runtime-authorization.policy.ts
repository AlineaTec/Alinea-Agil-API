import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"

/**
 * Lectura de runtime: listado `GET .../projects` y resumen `GET .../projects/:id/summary`.
 * Alineado a lectura de tablero Sprint (`assertCanReadSprintBoard`) y descubrimiento de proyectos en cliente:
 * roles operativos Scrum/Kanban que ya consumen rutas por `projectPublicId` necesitan listar y abrir resumen.
 */
export function assertCanReadProjectRuntime(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectRuntimeForbiddenError("Deactivated members cannot read operational projects.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (ar === "auditor") {
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

  throw new ProjectRuntimeForbiddenError(
    "Only workspace members with administrative, audit, or eligible methodological roles may read operational projects.",
  )
}
