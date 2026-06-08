import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { TeamFlowDeliveryMetricsForbiddenError } from "../domain/team-flow-delivery-metrics.errors.js"

/**
 * v1 postura (contracts-docs + README): no ranking hostil, sin HR; restringe cross-team y señales de asignación.
 * Resumen: miembros activos del workspace (misma idea que team-operational summary).
 * Cross-team: **no** auditor ni scrum_developer.
 * `assignment-quality`: agregados de reasignación y tiempo a primera asignación — no auditor, no developer.
 */

function assertActiveWorkspaceMember(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new TeamFlowDeliveryMetricsForbiddenError("Deactivated or pending members cannot read team flow delivery metrics.")
  }
  if (actor.status !== "active" && actor.status !== "active_without_seat") {
    throw new TeamFlowDeliveryMetricsForbiddenError("You do not have permission to read team flow delivery metrics.")
  }
}

export function assertCanReadFlowDeliverySummary(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
}

const MR_ALLOW_CROSS = new Set<string>(["agility_lead", "scrum_master", "product_owner", "scrum_coach"])
const AR_ALLOW_ASSIGNMENT_QUALITY = new Set<string>(["admin", "operator"])

/**
 * Misma lógica que `assertCanReadFlowAssignmentQuality` sin lanzar: para rellenar o anonimizar DTOs.
 */
export function isFlowAssignmentQualityReadable(actor: WorkspaceMemberState): boolean {
  if (actor.status === "deactivated" || actor.status === "pending") return false
  if (actor.status !== "active" && actor.status !== "active_without_seat") return false
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar && AR_ALLOW_ASSIGNMENT_QUALITY.has(ar)) return true
  if (mr && MR_ALLOW_CROSS.has(mr)) return true
  return false
}

/**
 * Listado de equipos / comparativa: sin auditor, sin `scrum_developer`.
 */
export function assertCanReadFlowDeliveryCrossTeam(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (mr && MR_ALLOW_CROSS.has(mr)) return
  if (ar === "auditor") {
    throw new TeamFlowDeliveryMetricsForbiddenError("Auditor role cannot read cross-team flow delivery metrics in v1.")
  }
  if (actor.workspaceRoleMethodological === "scrum_developer") {
    throw new TeamFlowDeliveryMetricsForbiddenError(
      "scrum_developer cannot read cross-team flow delivery comparison in v1. Use team flow summary in context.",
    )
  }
  throw new TeamFlowDeliveryMetricsForbiddenError("You do not have permission to read cross-team flow delivery metrics.")
}

/**
 * Métricas de calidad de asignación: tiempo a primera asignación y reasignaciones.
 * `scrum_coach` solo lectura agregada (no reasigna en v1) pero puede ver señal de coordinación: incluido.
 * Excluidos: `auditor`, `scrum_developer`, sin rol de coordinación/operación.
 */
export function assertCanReadFlowAssignmentQuality(actor: WorkspaceMemberState): void {
  assertActiveWorkspaceMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar && AR_ALLOW_ASSIGNMENT_QUALITY.has(ar)) return
  if (mr && MR_ALLOW_CROSS.has(mr)) return
  if (ar === "auditor") {
    throw new TeamFlowDeliveryMetricsForbiddenError("Auditor cannot read assignment-quality flow signals in v1.")
  }
  if (actor.workspaceRoleMethodological === "scrum_developer") {
    throw new TeamFlowDeliveryMetricsForbiddenError("scrum_developer cannot read assignment-quality flow metrics in v1.")
  }
  throw new TeamFlowDeliveryMetricsForbiddenError("You do not have permission to read assignment-quality flow metrics.")
}
