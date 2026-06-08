import type { Prisma, PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkItemCommentState } from "../../domain/work-item-comment.js"
import { docToWorkItemCommentState } from "../mappers/work-item-comment.mapper.js"
import type { ListCommentsCursor, WorkItemCommentsRepository } from "../work-item-comments.repository.js"
import type { WorkItemCommentDocProps } from "../schemas/work-item-comment.schema.js"

function rowToDoc(row: {
  public_id: string
  workspace_public_id: string
  project_public_id: string
  work_item_public_id: string
  body: string
  created_by_user_public_id: string
  deleted_at: Date | null
  deleted_by_user_public_id: string | null
  created_at: Date
  updated_at: Date
}): WorkItemCommentDocProps {
  return {
    commentPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    backlogItemPublicId: row.work_item_public_id,
    body: row.body,
    createdByUserPublicId: row.created_by_user_public_id,
    deletedAt: row.deleted_at,
    deletedByUserPublicId: row.deleted_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class WorkItemCommentsPrismaRepository implements WorkItemCommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(comment: WorkItemCommentState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, comment.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      comment.workspacePublicId,
      comment.projectPublicId,
    )
    const workItemId = await resolveWorkItemId(
      this.prisma,
      comment.workspacePublicId,
      comment.projectPublicId,
      comment.backlogItemPublicId,
    )
    if (!workspaceId || !projectId || !workItemId) {
      throw new Error("work_item_comment_insert_context_not_found")
    }
    await this.prisma.workItemComment.create({
      data: {
        public_id: comment.commentPublicId,
        workspace_id: workspaceId,
        workspace_public_id: comment.workspacePublicId,
        project_id: projectId,
        project_public_id: comment.projectPublicId,
        work_item_id: workItemId,
        work_item_public_id: comment.backlogItemPublicId,
        body: comment.body,
        created_by_user_public_id: comment.createdByUserPublicId,
        deleted_at: comment.deletedAt,
        deleted_by_user_public_id: comment.deletedByUserPublicId,
        created_at: comment.createdAt,
        updated_at: comment.updatedAt,
      },
    })
  }

  async findActiveByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    commentPublicId: string,
  ): Promise<WorkItemCommentState | null> {
    const row = await this.prisma.workItemComment.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        work_item_public_id: backlogItemPublicId,
        public_id: commentPublicId,
        deleted_at: null,
      },
    })
    return row ? docToWorkItemCommentState(rowToDoc(row)) : null
  }

  async listActivePage(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    limit: number
    after: ListCommentsCursor | null
  }): Promise<WorkItemCommentState[]> {
    const where: Prisma.WorkItemCommentWhereInput = {
      workspace_public_id: input.workspacePublicId,
      project_public_id: input.projectPublicId,
      work_item_public_id: input.backlogItemPublicId,
      deleted_at: null,
    }
    if (input.after) {
      where.OR = [
        { created_at: { gt: input.after.createdAt } },
        {
          created_at: input.after.createdAt,
          public_id: { gt: input.after.commentPublicId },
        },
      ]
    }
    const rows = await this.prisma.workItemComment.findMany({
      where,
      orderBy: [{ created_at: "asc" }, { public_id: "asc" }],
      take: input.limit,
    })
    return rows.map((r) => docToWorkItemCommentState(rowToDoc(r)))
  }

  async updateBody(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    body: string
    updatedAt: Date
  }): Promise<WorkItemCommentState | null> {
    const res = await this.prisma.workItemComment.updateMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        work_item_public_id: input.backlogItemPublicId,
        public_id: input.commentPublicId,
        deleted_at: null,
      },
      data: { body: input.body, updated_at: input.updatedAt },
    })
    if (res.count === 0) return null
    return this.findActiveByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.backlogItemPublicId,
      input.commentPublicId,
    )
  }

  async softDelete(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    deletedAt: Date
    deletedByUserPublicId: string
  }): Promise<WorkItemCommentState | null> {
    const res = await this.prisma.workItemComment.updateMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        work_item_public_id: input.backlogItemPublicId,
        public_id: input.commentPublicId,
        deleted_at: null,
      },
      data: {
        deleted_at: input.deletedAt,
        deleted_by_user_public_id: input.deletedByUserPublicId,
        updated_at: input.deletedAt,
      },
    })
    if (res.count === 0) return null
    const row = await this.prisma.workItemComment.findFirst({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        public_id: input.commentPublicId,
      },
    })
    return row ? docToWorkItemCommentState(rowToDoc(row)) : null
  }
}
