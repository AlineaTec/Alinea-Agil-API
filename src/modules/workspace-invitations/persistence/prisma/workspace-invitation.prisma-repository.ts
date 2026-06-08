import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceInvitationState } from "../../domain/workspace-invitation.js"
import type {
  WorkspaceInvitationPlatformAdminListFilter,
  WorkspaceInvitationRepository,
} from "../workspace-invitation.repository.js"
import {
  workspaceInvitationFromPrisma,
  workspaceInvitationToPrisma,
} from "./workspace-invitation.prisma-mapper.js"

export class WorkspaceInvitationPrismaRepository implements WorkspaceInvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(
    tokenHash: string,
    _session?: ClientSession,
  ): Promise<WorkspaceInvitationState | null> {
    const row = await this.prisma.workspaceInvitation.findUnique({ where: { token_hash: tokenHash } })
    return row ? workspaceInvitationFromPrisma(row) : null
  }

  async findPendingByWorkspaceAndEmail(
    workspacePublicId: string,
    emailNormalized: string,
    _session?: ClientSession,
  ): Promise<WorkspaceInvitationState | null> {
    const row = await this.prisma.workspaceInvitation.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        email_normalized: emailNormalized,
        status: "pending",
      },
    })
    return row ? workspaceInvitationFromPrisma(row) : null
  }

  async findByInvitationPublicId(
    invitationPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceInvitationState | null> {
    const row = await this.prisma.workspaceInvitation.findUnique({
      where: { public_id: invitationPublicId },
    })
    return row ? workspaceInvitationFromPrisma(row) : null
  }

  async insert(row: WorkspaceInvitationState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, row.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${row.workspacePublicId}`)
    await this.prisma.workspaceInvitation.create({
      data: workspaceInvitationToPrisma(row, workspaceId),
    })
  }

  async replace(row: WorkspaceInvitationState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, row.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${row.workspacePublicId}`)
    const res = await this.prisma.workspaceInvitation.updateMany({
      where: { public_id: row.invitationPublicId },
      data: workspaceInvitationToPrisma(row, workspaceId),
    })
    if (res.count === 0) throw new Error("workspace_invitation_not_found")
  }

  async listPendingForWorkspace(workspacePublicId: string): Promise<WorkspaceInvitationState[]> {
    const rows = await this.prisma.workspaceInvitation.findMany({
      where: { workspace_public_id: workspacePublicId, status: "pending" },
      orderBy: { created_at: "desc" },
    })
    return rows.map(workspaceInvitationFromPrisma)
  }

  async listForPlatformAdminQuery(
    opts: WorkspaceInvitationPlatformAdminListFilter,
  ): Promise<{ rows: WorkspaceInvitationState[]; total: number }> {
    const where: Prisma.WorkspaceInvitationWhereInput = {}
    if (opts.workspacePublicId) where.workspace_public_id = opts.workspacePublicId
    if (opts.status) where.status = opts.status
    if (opts.emailContains?.trim()) {
      where.email_normalized = { contains: opts.emailContains.trim().toLowerCase(), mode: "insensitive" }
    }
    if (opts.createdFrom || opts.createdTo) {
      where.created_at = {}
      if (opts.createdFrom) where.created_at.gte = opts.createdFrom
      if (opts.createdTo) where.created_at.lte = opts.createdTo
    }

    const [total, rows] = await Promise.all([
      this.prisma.workspaceInvitation.count({ where }),
      this.prisma.workspaceInvitation.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: opts.offset,
        take: opts.limit,
      }),
    ])
    return { rows: rows.map(workspaceInvitationFromPrisma), total }
  }
}
