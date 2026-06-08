import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

/**
 * Listado workspace-wide de proyectos operativos (`GET .../projects`) y el mismo criterio para listados
 * cross-team de equipos en métricas (flow, operativo, predictabilidad).
 * Quien no califique aquí solo ve datos de equipos donde tiene membresía activa — incluye
 * **scrum_master**, **product_owner**, **scrum_developer** y **scrum_coach** (roles **agility_lead** y administrativos/auditoría: workspace-wide).
 */
export function operationalProjectListingIsWorkspaceWide(actor: WorkspaceMemberState): boolean {
  if (actor.status === "deactivated") {
    return false
  }

  const ar = actor.workspaceRoleAdministrative
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return true
  }

  if (actor.workspaceRoleMethodological === "agility_lead") {
    return true
  }

  return false
}
