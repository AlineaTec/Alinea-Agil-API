import type { PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkTeamId, resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkTeamProjectLinkState } from "../../domain/work-team.js"
import type { WorkTeamProjectLinkRepository } from "../work-team-project-link.repository.js"
import { workTeamProjectLinkFromPrisma } from "./work-team.prisma-mapper.js"

/**
 * Enlaces equipo–proyecto. `project_id` FK a `projects`; `project_public_id` denormalizado para consultas.
 */
export class WorkTeamProjectLinkPrismaRepository implements WorkTeamProjectLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listDistinctProjectPublicIdsForTeams(
    workspacePublicId: string,
    teamPublicIds: string[],
    _session?: ClientSession,
  ): Promise<string[]> {
    if (teamPublicIds.length === 0) return []
    const rows = await this.prisma.workTeamProjectLink.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        team_public_id: { in: teamPublicIds },
      },
      select: { project_public_id: true },
      distinct: ["project_public_id"],
      orderBy: { project_public_id: "asc" },
    })
    return rows.map((r) => r.project_public_id)
  }

  async insert(state: WorkTeamProjectLinkState, _session?: ClientSession): Promise<void> {
    const teamId = await resolveWorkTeamId(this.prisma, state.workspacePublicId, state.teamPublicId)
    if (!teamId) throw new Error(`work_team_not_found:${state.teamPublicId}`)
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!projectId) throw new Error(`project_not_found:${state.projectPublicId}`)

    await this.prisma.workTeamProjectLink.create({
      data: {
        public_id: state.teamProjectLinkPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        team_id: teamId,
        team_public_id: state.teamPublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
    })
  }

  async deleteByTeamAndProject(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
    _session?: ClientSession,
  ): Promise<boolean> {
    const res = await this.prisma.workTeamProjectLink.deleteMany({
      where: { workspace_public_id: workspacePublicId, team_public_id: teamPublicId, project_public_id: projectPublicId },
    })
    return res.count > 0
  }

  async listByTeam(
    workspacePublicId: string,
    teamPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState[]> {
    const rows = await this.prisma.workTeamProjectLink.findMany({
      where: { workspace_public_id: workspacePublicId, team_public_id: teamPublicId },
      orderBy: { project_public_id: "asc" },
    })
    return rows.map(workTeamProjectLinkFromPrisma)
  }

  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState[]> {
    const rows = await this.prisma.workTeamProjectLink.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: { team_public_id: "asc" },
    })
    return rows.map(workTeamProjectLinkFromPrisma)
  }

  async findByTeamAndProject(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkTeamProjectLinkState | null> {
    const row = await this.prisma.workTeamProjectLink.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        team_public_id: teamPublicId,
        project_public_id: projectPublicId,
      },
    })
    return row ? workTeamProjectLinkFromPrisma(row) : null
  }
}
