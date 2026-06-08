import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceMemberState } from "../../domain/workspace-member.js"
import type {
  ListWorkspaceMembersFilters,
  ListWorkspaceMembersSort,
  WorkspaceMembersListStats,
} from "../list-workspace-members.types.js"
import type { WorkspaceMemberRepository } from "../workspace-member.repository.js"
import {
  workspaceMemberFromPrisma,
  workspaceMemberToPrismaCreate,
} from "./workspace-member.prisma-mapper.js"

function buildMemberWhere(
  workspaceId: string,
  filters: ListWorkspaceMembersFilters,
): Prisma.WorkspaceMemberWhereInput {
  const where: Prisma.WorkspaceMemberWhereInput = { workspace_id: workspaceId }
  if (filters.status) where.status = filters.status
  if (filters.hasSeatAssigned !== undefined) where.has_seat_assigned = filters.hasSeatAssigned
  if (filters.userPublicId) where.user_public_id = filters.userPublicId
  if (filters.roleCategory === "administrative") {
    where.workspace_role_administrative = { not: null }
  }
  if (filters.roleCategory === "methodological") {
    where.workspace_role_methodological = { not: null }
  }
  if (filters.workspaceRoleAdministrative) {
    where.workspace_role_administrative = filters.workspaceRoleAdministrative
  }
  if (filters.workspaceRoleMethodological) {
    where.workspace_role_methodological = filters.workspaceRoleMethodological
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim()
    where.OR = [
      { full_name: { contains: q, mode: "insensitive" } },
      { email_normalized: { contains: q, mode: "insensitive" } },
      { user_public_id: { contains: q, mode: "insensitive" } },
      { public_id: { contains: q, mode: "insensitive" } },
    ]
  }
  return where
}

function orderBy(sort: ListWorkspaceMembersSort): Prisma.WorkspaceMemberOrderByWithRelationInput {
  if (sort === "updated_desc") return { updated_at: "desc" }
  if (sort === "updated_asc") return { updated_at: "asc" }
  return { full_name: "asc" }
}

const memberInclude = { workspace: { select: { public_id: true } } } as const

/** Membresías operativas en PostgreSQL. en runtime. */
export class WorkspaceMemberPrismaRepository implements WorkspaceMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByMembershipPublicId(
    membershipPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceMemberState | null> {
    const row = await this.prisma.workspaceMember.findUnique({
      where: { public_id: membershipPublicId },
      include: memberInclude,
    })
    return row ? workspaceMemberFromPrisma(row) : null
  }

  async findByWorkspaceAndEmail(
    workspacePublicId: string,
    emailNormalized: string,
    _session?: ClientSession,
  ): Promise<WorkspaceMemberState | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return null
    const row = await this.prisma.workspaceMember.findUnique({
      where: {
        workspace_id_email_normalized: { workspace_id: workspaceId, email_normalized: emailNormalized },
      },
      include: memberInclude,
    })
    return row ? workspaceMemberFromPrisma(row) : null
  }

  async findByWorkspaceAndUserPublicId(
    workspacePublicId: string,
    userPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceMemberState | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return null
    const row = await this.prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_public_id: { workspace_id: workspaceId, user_public_id: userPublicId },
      },
      include: memberInclude,
    })
    return row ? workspaceMemberFromPrisma(row) : null
  }

  async listByWorkspacePublicId(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceMemberState[]> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return []
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: "asc" },
      include: memberInclude,
    })
    return rows.map(workspaceMemberFromPrisma)
  }

  async listByWorkspaceFiltered(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    options: { sort: ListWorkspaceMembersSort; limit: number; offset: number },
    _session?: ClientSession,
  ): Promise<{ items: WorkspaceMemberState[]; totalCount: number }> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return { items: [], totalCount: 0 }
    const where = buildMemberWhere(workspaceId, filters)
    const [totalCount, rows] = await Promise.all([
      this.prisma.workspaceMember.count({ where }),
      this.prisma.workspaceMember.findMany({
        where,
        orderBy: orderBy(options.sort),
        skip: options.offset,
        take: options.limit,
        include: memberInclude,
      }),
    ])
    return { totalCount, items: rows.map(workspaceMemberFromPrisma) }
  }

  async countByWorkspaceFiltered(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    _session?: ClientSession,
  ): Promise<number> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return 0
    return this.prisma.workspaceMember.count({
      where: buildMemberWhere(workspaceId, filters),
    })
  }

  async aggregateStatusStatsByWorkspace(
    workspacePublicId: string,
    filters: ListWorkspaceMembersFilters,
    _session?: ClientSession,
  ): Promise<WorkspaceMembersListStats> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const stats: WorkspaceMembersListStats = {
      total: 0,
      pending: 0,
      active: 0,
      active_without_seat: 0,
      deactivated: 0,
    }
    if (!workspaceId) return stats

    const rows = await this.prisma.workspaceMember.groupBy({
      by: ["status"],
      where: buildMemberWhere(workspaceId, filters),
      _count: { _all: true },
    })
    for (const row of rows) {
      const n = row._count._all
      stats.total += n
      switch (row.status) {
        case "pending":
          stats.pending = n
          break
        case "active":
          stats.active = n
          break
        case "active_without_seat":
          stats.active_without_seat = n
          break
        case "deactivated":
          stats.deactivated = n
          break
      }
    }
    return stats
  }

  async listByUserPublicId(
    userPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceMemberState[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { user_public_id: userPublicId },
      orderBy: { updated_at: "desc" },
      include: memberInclude,
    })
    return rows.map(workspaceMemberFromPrisma)
  }

  async countOtherActiveAdministrativeAdmins(
    workspacePublicId: string,
    excludeMembershipPublicId: string | null,
    _session?: ClientSession,
  ): Promise<number> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return 0
    return this.prisma.workspaceMember.count({
      where: {
        workspace_id: workspaceId,
        status: { not: "deactivated" },
        workspace_role_administrative: "admin",
        ...(excludeMembershipPublicId
          ? { public_id: { not: excludeMembershipPublicId } }
          : {}),
      },
    })
  }

  async countActiveSeatConsumingMembers(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<number> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return 0
    return this.prisma.workspaceMember.count({
      where: {
        workspace_id: workspaceId,
        status: "active",
        has_seat_assigned: true,
      },
    })
  }

  async insert(state: WorkspaceMemberState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.workspaceMember.create({
      data: workspaceMemberToPrismaCreate(state, workspaceId),
    })
  }

  async replace(state: WorkspaceMemberState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    const res = await this.prisma.workspaceMember.updateMany({
      where: { public_id: state.membershipPublicId },
      data: workspaceMemberToPrismaCreate(state, workspaceId),
    })
    if (res.count === 0) throw new Error("workspace_member_not_found")
  }

  async deleteByMembershipPublicId(
    membershipPublicId: string,
    _session?: ClientSession,
  ): Promise<void> {
    const res = await this.prisma.workspaceMember.deleteMany({
      where: { public_id: membershipPublicId },
    })
    if (res.count === 0) throw new Error("workspace_member_not_found")
  }
}
