import type { PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkItemImplicitFollowRepository } from "../work-item-implicit-follow.repository.js"

const IMPLICIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export class WorkItemImplicitFollowPrismaRepository implements WorkItemImplicitFollowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async touch(input: {
    workspacePublicId: string
    userPublicId: string
    backlogItemPublicId: string
    at: Date
  }): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, input.workspacePublicId)
    const workItem = await this.prisma.workItem.findFirst({
      where: {
        workspace_public_id: input.workspacePublicId,
        public_id: input.backlogItemPublicId,
      },
      select: { id: true },
    })
    if (!workspaceId || !workItem) return
    const workItemId = workItem.id

    const existing = await this.prisma.workItemImplicitFollow.findUnique({
      where: {
        workspace_id_user_public_id_work_item_id: {
          workspace_id: workspaceId,
          user_public_id: input.userPublicId,
          work_item_id: workItemId,
        },
      },
    })
    const nextAt =
      existing && existing.last_interaction_at > input.at ? existing.last_interaction_at : input.at

    await this.prisma.workItemImplicitFollow.upsert({
      where: {
        workspace_id_user_public_id_work_item_id: {
          workspace_id: workspaceId,
          user_public_id: input.userPublicId,
          work_item_id: workItemId,
        },
      },
      create: {
        workspace_id: workspaceId,
        workspace_public_id: input.workspacePublicId,
        user_public_id: input.userPublicId,
        work_item_id: workItemId,
        work_item_public_id: input.backlogItemPublicId,
        last_interaction_at: nextAt,
      },
      update: { last_interaction_at: nextAt },
    })
  }

  async listUserIdsFollowingItem(input: {
    workspacePublicId: string
    backlogItemPublicId: string
    now: Date
  }): Promise<string[]> {
    const cutoff = new Date(input.now.getTime() - IMPLICIT_WINDOW_MS)
    const rows = await this.prisma.workItemImplicitFollow.findMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        work_item_public_id: input.backlogItemPublicId,
        last_interaction_at: { gte: cutoff },
      },
      select: { user_public_id: true },
    })
    return rows.map((r) => r.user_public_id)
  }
}
