import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import {
  resolveWorkTeamId,
  resolveWorkspaceId,
} from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkTeamState, WorkTeamStatus } from "../../domain/work-team.js"
import type { ListWorkTeamsFilters, Pagination, WorkTeamRepository } from "../work-team.repository.js"
import { workTeamFromPrisma } from "./work-team.prisma-mapper.js"

export class WorkTeamPrismaRepository implements WorkTeamRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: WorkTeamState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.workTeam.create({
      data: {
        public_id: state.teamPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        name: state.name,
        name_normalized: state.nameNormalized,
        description: state.description,
        status: state.status,
        team_lead_user_public_id: state.teamLeadUserPublicId,
        target_size: state.targetSize,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
    })
  }

  async findByTeamPublicId(
    workspacePublicId: string,
    teamPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkTeamState | null> {
    const row = await this.prisma.workTeam.findFirst({
      where: { workspace_public_id: workspacePublicId, public_id: teamPublicId },
    })
    return row ? workTeamFromPrisma(row) : null
  }

  async findByWorkspaceAndNameNormalized(
    workspacePublicId: string,
    nameNormalized: string,
    _session?: ClientSession,
  ): Promise<WorkTeamState | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return null
    const row = await this.prisma.workTeam.findUnique({
      where: {
        workspace_id_name_normalized: { workspace_id: workspaceId, name_normalized: nameNormalized },
      },
    })
    return row ? workTeamFromPrisma(row) : null
  }

  async list(
    workspacePublicId: string,
    filters: ListWorkTeamsFilters,
    pagination: Pagination,
    _session?: ClientSession,
  ): Promise<{ items: WorkTeamState[]; totalCount: number }> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return { items: [], totalCount: 0 }

    let teamIdFilter: string[] | null = null
    if (filters.memberUserPublicId) {
      const memberships = await this.prisma.workTeamMembership.findMany({
        where: {
          workspace_public_id: workspacePublicId,
          user_public_id: filters.memberUserPublicId,
          is_active: true,
        },
        select: { team_public_id: true },
      })
      teamIdFilter = [...new Set(memberships.map((m) => m.team_public_id))]
      if (teamIdFilter.length === 0) return { items: [], totalCount: 0 }
    }

    const where: Prisma.WorkTeamWhereInput = { workspace_id: workspaceId }
    if (filters.status) where.status = filters.status
    if (filters.teamLeadUserPublicId) {
      where.team_lead_user_public_id = filters.teamLeadUserPublicId
    }
    if (teamIdFilter) where.public_id = { in: teamIdFilter }
    if (filters.q?.trim()) {
      const q = filters.q.trim()
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { name_normalized: { contains: q.toLowerCase(), mode: "insensitive" } },
        { public_id: { contains: q, mode: "insensitive" } },
      ]
    }

    const [totalCount, rows] = await Promise.all([
      this.prisma.workTeam.count({ where }),
      this.prisma.workTeam.findMany({
        where,
        orderBy: { name_normalized: "asc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
    ])
    return { items: rows.map(workTeamFromPrisma), totalCount }
  }

  async update(
    workspacePublicId: string,
    teamPublicId: string,
    patch: Partial<{
      name: string
      nameNormalized: string
      description: string | null
      status: WorkTeamStatus
      teamLeadUserPublicId: string | null
      targetSize: number | null
    }>,
    _session?: ClientSession,
  ): Promise<WorkTeamState | null> {
    const teamId = await resolveWorkTeamId(this.prisma, workspacePublicId, teamPublicId)
    if (!teamId) return null
    const data: Prisma.WorkTeamUpdateInput = {}
    if (patch.name !== undefined) data.name = patch.name
    if (patch.nameNormalized !== undefined) data.name_normalized = patch.nameNormalized
    if (patch.description !== undefined) data.description = patch.description
    if (patch.status !== undefined) data.status = patch.status
    if (patch.teamLeadUserPublicId !== undefined) {
      data.team_lead_user_public_id = patch.teamLeadUserPublicId
    }
    if (patch.targetSize !== undefined) data.target_size = patch.targetSize

    try {
      const row = await this.prisma.workTeam.update({ where: { id: teamId }, data })
      return workTeamFromPrisma(row)
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return null
      }
      throw err
    }
  }
}
