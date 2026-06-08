import type { PrismaClient } from "@prisma/client"
import { resolveProjectId, resolveWorkItemId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkControlOverrideTokenRepository } from "../work-control-override-token.repository.js"
import { docToOverrideToken } from "../work-controls.persistence-mapper.js"

export class WorkControlOverrideTokenPrismaRepository implements WorkControlOverrideTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOne(
    overrideTokenPublicId: string,
    workspacePublicId: string,
    projectPublicId: string,
  ) {
    const row = await this.prisma.workControlOverrideToken.findFirst({
      where: {
        public_id: overrideTokenPublicId,
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
      },
    })
    if (!row) return null
    return docToOverrideToken({
      overrideTokenPublicId: row.public_id,
      workspacePublicId: row.workspace_public_id,
      projectPublicId: row.project_public_id,
      workItemPublicId: row.work_item_public_id,
      eventCode: row.event_code,
      actorUserPublicId: row.actor_user_public_id,
      reason: row.reason,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    })
  }

  async create(state: Parameters<WorkControlOverrideTokenRepository["create"]>[0]): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!workspaceId || !projectId) throw new Error("work_control_override_token_insert_context_not_found")
    const workItemId = await resolveWorkItemId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
      state.workItemPublicId,
    )
    if (!workItemId) throw new Error("work_control_override_token_work_item_not_found")
    await this.prisma.workControlOverrideToken.create({
      data: {
        public_id: state.overrideTokenPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        work_item_id: workItemId,
        work_item_public_id: state.workItemPublicId,
        event_code: state.eventCode,
        actor_user_public_id: state.actorUserPublicId,
        reason: state.reason,
        expires_at: state.expiresAt,
        consumed_at: state.consumedAt,
        created_at: state.createdAt,
        updated_at: state.createdAt,
      },
    })
  }

  async markConsumed(overrideTokenPublicId: string, consumedAt: Date): Promise<boolean> {
    const res = await this.prisma.workControlOverrideToken.updateMany({
      where: { public_id: overrideTokenPublicId, consumed_at: null },
      data: { consumed_at: consumedAt, updated_at: consumedAt },
    })
    return res.count > 0
  }
}
