import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { WorkTeamForbiddenError } from "../domain/work-team.errors.js"

/**
 * Lectura de equipos (listado, detalle, miembros, vínculos, equipos-por-proyecto):
 * amplia v1: cualquier miembro del workspace con estado operativo (`active` o
 * `active_without_seat`), con cualquier rol (incl. scrum, PO, dev, coach, auditor).
 * Queda fuera: `pending` y `deactivated` (misma postura de “acceso real” al workspace).
 */
export function assertCanReadWorkTeams(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new WorkTeamForbiddenError("You do not have permission to read work teams in this workspace.")
  }
  if (actor.status !== "active" && actor.status !== "active_without_seat") {
    throw new WorkTeamForbiddenError("You do not have permission to read work teams in this workspace.")
  }
}

/**
 * Crear, editar, miembros, vínculos, liderazgo, archivar. v1: solo
 * `admin`, `operator`, `agility_lead` (sin SM, PO, dev, coach, auditor).
 */
export function assertCanMutateWorkTeams(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new WorkTeamForbiddenError("Deactivated or pending members cannot change work teams.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }
  if (mr === "agility_lead") {
    return
  }

  throw new WorkTeamForbiddenError(
    "You do not have permission to create or change work teams in this workspace.",
  )
}

/**
 * Lectura del log de auditoría de equipos: más estricta que `teams` general
 * (no basta con scrum dev / SM / PO, etc. que pueden listar equipos en algunos despliegues).
 * v1: alineada a quien muta o administra: admin, operator, agility_lead.
 */
export function assertCanReadWorkTeamAuditLog(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new WorkTeamForbiddenError("Deactivated or pending members cannot read work team audit.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || mr === "agility_lead") {
    return
  }

  throw new WorkTeamForbiddenError("You do not have permission to read the work team audit log.")
}
