import { ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { WorkspaceAssignableMemberDto } from "../../workspace-users/dto/workspace-assignable-member.dto.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"

/**
 * Igual criterio base que `GET /workspaces/:w/members/assignable-for-work-items`,
 * filtrado a quienes pertenecen a equipos **active** vinculados al proyecto.
 */
export type ProjectAssignablesMemberRow = WorkspaceAssignableMemberDto & {
  /** Equipos del proyecto de los que sale la elegibilidad (pistas de UI). */
  sourceTeams: { teamPublicId: string; teamName: string; isTeamLead: boolean }[]
  workspaceRoleAdministrative: string | null
  workspaceRoleMethodological: string | null
}

export class ProjectAssignableUsersService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeRepository,
    private readonly projectLinks: WorkTeamProjectLinkRepository,
    private readonly teams: WorkTeamRepository,
    private readonly memberships: WorkTeamMembershipRepository,
    private readonly workspaceUserService: WorkspaceUserService,
  ) {}

  /**
   * `listAssignableMembersForWorkItems` ∩ miembros activos de equipos **active** vinculados al proyecto.
   */
  async listAssignablesForProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<{
    projectTeamLinkCount: number
    members: ProjectAssignablesMemberRow[]
  }> {
    const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!p) {
      throw new ProjectRuntimeNotFoundError()
    }
    const links = await this.projectLinks.listByProject(workspacePublicId, projectPublicId)
    if (links.length === 0) {
      return { projectTeamLinkCount: 0, members: [] }
    }

    const sourceTeamsByUser = new Map<
      string,
      { teamPublicId: string; teamName: string; isTeamLead: boolean }[]
    >()

    for (const link of links) {
      const team = await this.teams.findByTeamPublicId(workspacePublicId, link.teamPublicId)
      if (!team || team.status !== "active") {
        continue
      }
      // No filtrar por `workspacePublicId` en la membresía: el equipo ya quedó acotado al workspace
      // vía `findByTeamPublicId` arriba. Filtrar de nuevo puede excluir filas cuyo `workspacePublicId`
      // en BD no coincide (legado / inconsistencia) aunque el `teamPublicId` sea el correcto;
      // `findActiveByTeamAndUser` tampoco filtra por workspace. Coherente con listar el roster del equipo.
      const mems = await this.memberships.listByTeam(link.teamPublicId, { activeOnly: true })
      for (const m of mems) {
        const uid = m.userPublicId
        const isTeamLead = team.teamLeadUserPublicId !== null && team.teamLeadUserPublicId === uid
        const entry = { teamPublicId: team.teamPublicId, teamName: team.name, isTeamLead }
        const cur = sourceTeamsByUser.get(uid)
        if (!cur) {
          sourceTeamsByUser.set(uid, [entry])
        } else {
          const has = cur.some((x) => x.teamPublicId === entry.teamPublicId)
          if (!has) cur.push(entry)
        }
      }
    }

    if (sourceTeamsByUser.size === 0) {
      return { projectTeamLinkCount: links.length, members: [] }
    }

    const assignableWorkspace = await this.workspaceUserService.listAssignableMembersForWorkItems(workspacePublicId)

    const members: ProjectAssignablesMemberRow[] = []
    for (const row of assignableWorkspace) {
      const sourceTeams = sourceTeamsByUser.get(row.userPublicId)
      if (!sourceTeams) continue

      const actor = await this.workspaceUserService.findActorMember(workspacePublicId, row.userPublicId)
      const sortedTeams = [...sourceTeams].sort((a, b) =>
        a.teamName.localeCompare(b.teamName, undefined, { sensitivity: "base" }),
      )
      members.push({
        userPublicId: row.userPublicId,
        fullName: row.fullName,
        emailNormalized: row.emailNormalized,
        sourceTeams: sortedTeams,
        workspaceRoleAdministrative: actor?.workspaceRoleAdministrative ?? null,
        workspaceRoleMethodological: actor?.workspaceRoleMethodological ?? null,
      })
    }

    members.sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }),
    )

    return { projectTeamLinkCount: links.length, members }
  }

  async hasProjectTeamLink(workspacePublicId: string, projectPublicId: string): Promise<boolean> {
    const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!p) return false
    const links = await this.projectLinks.listByProject(workspacePublicId, projectPublicId)
    return links.length > 0
  }

  async hasAnyProjectTeamLink(workspacePublicId: string, projectPublicId: string): Promise<boolean> {
    const links = await this.projectLinks.listByProject(workspacePublicId, projectPublicId)
    return links.length > 0
  }

  async isUserInAssignableUniverse(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
  ): Promise<boolean> {
    const { members } = await this.listAssignablesForProject(workspacePublicId, projectPublicId)
    return members.some((i) => i.userPublicId === userPublicId)
  }
}
