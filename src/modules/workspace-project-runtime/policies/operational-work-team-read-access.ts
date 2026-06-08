import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { operationalProjectListingIsWorkspaceWide } from "./operational-project-listing-scope.policy.js"

/**
 * Lectura de superficies por equipo (métricas, flow, predictabilidad): mismas reglas que el listado de proyectos operativos.
 * Roles no workspace-wide (p. ej. scrum_master, product_owner, scrum_developer, scrum_coach) solo filas de equipos donde la membresía está activa.
 */
export async function actorMayReadWorkTeamOperationalSurface(
  memberships: WorkTeamMembershipRepository,
  actor: WorkspaceMemberState,
  workspacePublicId: string,
  teamPublicId: string,
): Promise<boolean> {
  if (operationalProjectListingIsWorkspaceWide(actor)) {
    return true
  }
  const m = await memberships.findActiveByTeamAndUser(teamPublicId, actor.userPublicId)
  return m !== null && m.workspacePublicId === workspacePublicId
}
