import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { TeamOperationalMetricsForbiddenError } from "../domain/team-operational-metrics.errors.js"

/**
 * v1 postura conservadora; ver README: capacidades lógicas `team-metrics.*`.
 */
function assertActiveWorkspaceMember(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new TeamOperationalMetricsForbiddenError("Deactivated or pending members cannot read operational team metrics.")
  }
  if (actor.status !== "active" && actor.status !== "active_without_seat") {
    throw new TeamOperationalMetricsForbiddenError("You do not have permission to read operational team metrics.")
  }
}

/** Resumen por equipo, comparativa, y lecturas que no desglosan a terceros. */
export function assertCanReadTeamOperationalSummary(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
}

/**
 * Desglose por miembro: coordinación; no auditores / developers genéricos v1.
 */
export function assertCanReadTeamOperationalMemberBreakdown(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner" || mr === "scrum_coach") {
    return
  }
  if (ar === "auditor") {
    throw new TeamOperationalMetricsForbiddenError(
      "Auditor role cannot read per-member operational breakdown; aggregate metrics only.",
    )
  }
  throw new TeamOperationalMetricsForbiddenError(
    "You do not have permission to read per-member operational metrics for this team.",
  )
}

/**
 * Lista comparativa de equipos del workspace: evitar fuga de señal cross-team a dev.
 */
export function assertCanReadTeamOperationalCrossTeam(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_coach"
  ) {
    return
  }
  if (ar === "auditor") {
    throw new TeamOperationalMetricsForbiddenError("Auditor role cannot read cross-team operational comparison.")
  }
  throw new TeamOperationalMetricsForbiddenError(
    "You do not have permission to read cross-team operational metrics.",
  )
}
