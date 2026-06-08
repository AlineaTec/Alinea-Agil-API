import type { PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkTeamId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkTeamMembershipState } from "../../domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../work-team-membership.repository.js"
import { workTeamMembershipFromPrisma } from "./work-team.prisma-mapper.js"

export class WorkTeamMembershipPrismaRepository implements WorkTeamMembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveTeamPublicIdsForUserInWorkspace(
    workspacePublicId: string,
    userPublicId: string,
    _session?: ClientSession,
  ): Promise<string[]> {
    const rows = await this.prisma.workTeamMembership.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        user_public_id: userPublicId,
        is_active: true,
      },
      select: { team_public_id: true },
      orderBy: { team_public_id: "asc" },
    })
    return [...new Set(rows.map((r) => r.team_public_id))]
  }

  async insert(state: WorkTeamMembershipState, _session?: ClientSession): Promise<void> {
    const teamId = await resolveWorkTeamId(this.prisma, state.workspacePublicId, state.teamPublicId)
    if (!teamId) throw new Error(`work_team_not_found:${state.teamPublicId}`)
    const workspaceId = (
      await this.prisma.workTeam.findUnique({ where: { id: teamId }, select: { workspace_id: true } })
    )?.workspace_id
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)

    await this.prisma.workTeamMembership.create({
      data: {
        public_id: state.teamMembershipPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        team_id: teamId,
        team_public_id: state.teamPublicId,
        user_public_id: state.userPublicId,
        joined_at: state.joinedAt,
        left_at: state.leftAt,
        is_active: state.isActive,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
    })
  }

  async findActiveByTeamAndUser(
    teamPublicId: string,
    userPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkTeamMembershipState | null> {
    const row = await this.prisma.workTeamMembership.findFirst({
      where: { team_public_id: teamPublicId, user_public_id: userPublicId, is_active: true },
    })
    return row ? workTeamMembershipFromPrisma(row) : null
  }

  async listByTeam(
    teamPublicId: string,
    options: { activeOnly: boolean; workspacePublicId?: string },
    _session?: ClientSession,
  ): Promise<WorkTeamMembershipState[]> {
    const where: {
      team_public_id: string
      workspace_public_id?: string
      is_active?: boolean
    } = { team_public_id: teamPublicId }
    if (options.workspacePublicId) where.workspace_public_id = options.workspacePublicId
    if (options.activeOnly) where.is_active = true

    const rows = await this.prisma.workTeamMembership.findMany({
      where,
      orderBy: { joined_at: "asc" },
    })
    return rows.map(workTeamMembershipFromPrisma)
  }

  async softDeactivate(
    teamPublicId: string,
    userPublicId: string,
    leftAt: Date,
    _session?: ClientSession,
  ): Promise<WorkTeamMembershipState | null> {
    const existing = await this.prisma.workTeamMembership.findFirst({
      where: { team_public_id: teamPublicId, user_public_id: userPublicId, is_active: true },
    })
    if (!existing) return null
    const row = await this.prisma.workTeamMembership.update({
      where: { id: existing.id },
      data: { is_active: false, left_at: leftAt },
    })
    return workTeamMembershipFromPrisma(row)
  }
}
