import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  CreateWorkspaceOwnerMembershipInput,
  WorkspaceOwnerMembershipRepository,
  WorkspaceOwnerMembershipState,
} from "../workspace-owner-membership.repository.js"

/** Provisioning owner en PostgreSQL (tabla separada de `workspace_members`). */
export class WorkspaceOwnerMembershipPrismaRepository
  implements WorkspaceOwnerMembershipRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateWorkspaceOwnerMembershipInput,
  ): Promise<WorkspaceOwnerMembershipState> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    if (!workspaceId) {
      throw new Error(`workspace_not_found:${input.workspacePublicId}`)
    }

    const row = await this.prisma.workspaceOwnerMembership.create({
      data: {
        public_id: input.membershipPublicId,
        workspace_id: workspaceId,
        user_public_id: input.userPublicId,
        role: input.role,
      },
      include: { workspace: { select: { public_id: true } } },
    })

    return {
      membershipPublicId: row.public_id,
      workspacePublicId: row.workspace.public_id,
      userPublicId: row.user_public_id,
      role: "owner",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async findByWorkspaceAndUser(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<WorkspaceOwnerMembershipState | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return null

    const row = await this.prisma.workspaceOwnerMembership.findUnique({
      where: { workspace_id_user_public_id: { workspace_id: workspaceId, user_public_id: userPublicId } },
      include: { workspace: { select: { public_id: true } } },
    })
    if (!row) return null

    return {
      membershipPublicId: row.public_id,
      workspacePublicId: row.workspace.public_id,
      userPublicId: row.user_public_id,
      role: "owner",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
