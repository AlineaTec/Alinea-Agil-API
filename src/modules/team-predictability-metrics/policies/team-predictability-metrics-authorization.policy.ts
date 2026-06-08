import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { TeamPredictabilityMetricsForbiddenError } from "../domain/team-predictability-metrics.errors.js"

function assertActiveWorkspaceMember(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new TeamPredictabilityMetricsForbiddenError(
      "Deactivated or pending members cannot read team predictability metrics.",
    )
  }
  if (actor.status !== "active" && actor.status !== "active_without_seat") {
    throw new TeamPredictabilityMetricsForbiddenError("You do not have permission to read team predictability metrics.")
  }
}

/** Resumen: cualquier miembro operativo, incl. auditor y scrum_developer. */
export function assertCanReadPredictabilitySummary(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
}

const MR_COORD = new Set<string>(["agility_lead", "scrum_master", "product_owner", "scrum_coach"])

export function isPredictabilityPeriodTrendReadable(actor: WorkspaceMemberState): boolean {
  if (actor.status === "deactivated" || actor.status === "pending") return false
  if (actor.status !== "active" && actor.status !== "active_without_seat") return false
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (mr && MR_COORD.has(mr)) return true
  return false
}

export function isPredictabilityCrossTeamReadable(actor: WorkspaceMemberState): boolean {
  return isPredictabilityPeriodTrendReadable(actor)
}

/** Tendencia: sin auditor, sin scrum_developer; misma tesis que flow/operativo cross. */
export function assertCanReadPredictabilityPeriodTrend(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (mr && MR_COORD.has(mr)) return
  if (ar === "auditor") {
    throw new TeamPredictabilityMetricsForbiddenError("Auditor cannot read team predictability trend in v1.")
  }
  if (mr === "scrum_developer") {
    throw new TeamPredictabilityMetricsForbiddenError(
      "scrum_developer cannot read team predictability trend in v1. Summary remains available on the team.",
    )
  }
  throw new TeamPredictabilityMetricsForbiddenError("You do not have permission to read team predictability trend.")
}

export function assertCanReadPredictabilityCrossTeam(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (mr && MR_COORD.has(mr)) return
  if (ar === "auditor") {
    throw new TeamPredictabilityMetricsForbiddenError("Auditor cannot read cross-team predictability in v1.")
  }
  if (mr === "scrum_developer") {
    throw new TeamPredictabilityMetricsForbiddenError(
      "scrum_developer cannot read cross-team predictability in v1.",
    )
  }
  throw new TeamPredictabilityMetricsForbiddenError("You do not have permission to read cross-team predictability metrics.")
}
