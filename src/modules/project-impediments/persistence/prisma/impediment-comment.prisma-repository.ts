import type { PrismaClient } from "@prisma/client"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ProjectImpedimentCommentState } from "../../domain/project-impediment-comment.js"
import type {
  ListProjectImpedimentCommentsCursor,
  ProjectImpedimentCommentsRepository,
} from "../impediment-comments.repository.js"
import { docToProjectImpedimentCommentState } from "../mappers/project-impediment-comment.mapper.js"
import type { ProjectImpedimentCommentDocProps } from "../schemas/project-impediment-comment.schema.js"

async function resolveImpedimentId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  impedimentPublicId: string,
): Promise<string | null> {
  const row = await prisma.projectImpediment.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: impedimentPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

function rowToDoc(row: {
  public_id: string
  workspace_public_id: string
  project_public_id: string
  impediment_public_id: string
  body: string
  created_by_user_public_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  deleted_by_user_public_id: string | null
}): ProjectImpedimentCommentDocProps {
  return {
    commentPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    impedimentPublicId: row.impediment_public_id,
    body: row.body,
    createdByUserPublicId: row.created_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedByUserPublicId: row.deleted_by_user_public_id,
  }
}

export class ProjectImpedimentCommentPrismaRepository implements ProjectImpedimentCommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(comment: ProjectImpedimentCommentState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, comment.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      comment.workspacePublicId,
      comment.projectPublicId,
    )
    const impedimentId = await resolveImpedimentId(
      this.prisma,
      comment.workspacePublicId,
      comment.projectPublicId,
      comment.impedimentPublicId,
    )
    if (!workspaceId || !projectId || !impedimentId) {
      throw new Error("impediment_comment_insert_context_not_found")
    }
    await this.prisma.projectImpedimentComment.create({
      data: {
        public_id: comment.commentPublicId,
        impediment_id: impedimentId,
        impediment_public_id: comment.impedimentPublicId,
        workspace_id: workspaceId,
        workspace_public_id: comment.workspacePublicId,
        project_id: projectId,
        project_public_id: comment.projectPublicId,
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
    impedimentPublicId: string,
    commentPublicId: string,
  ): Promise<ProjectImpedimentCommentState | null> {
    const row = await this.prisma.projectImpedimentComment.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        impediment_public_id: impedimentPublicId,
        public_id: commentPublicId,
        deleted_at: null,
      },
    })
    return row ? docToProjectImpedimentCommentState(rowToDoc(row)) : null
  }

  async listActivePage(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    limit: number
    after: ListProjectImpedimentCommentsCursor | null
  }): Promise<ProjectImpedimentCommentState[]> {
    const rows = await this.prisma.projectImpedimentComment.findMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        impediment_public_id: input.impedimentPublicId,
        deleted_at: null,
        ...(input.after
          ? {
              OR: [
                { created_at: { gt: input.after.createdAt } },
                {
                  created_at: input.after.createdAt,
                  public_id: { gt: input.after.commentPublicId },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: "asc" }, { public_id: "asc" }],
      take: input.limit,
    })
    return rows.map((r) => docToProjectImpedimentCommentState(rowToDoc(r)))
  }

  async updateBody(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    commentPublicId: string
    body: string
    updatedAt: Date
  }): Promise<ProjectImpedimentCommentState | null> {
    const res = await this.prisma.projectImpedimentComment.updateMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        impediment_public_id: input.impedimentPublicId,
        public_id: input.commentPublicId,
        deleted_at: null,
      },
      data: { body: input.body, updated_at: input.updatedAt },
    })
    if (res.count === 0) return null
    return this.findActiveByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.impedimentPublicId,
      input.commentPublicId,
    )
  }

  async softDelete(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    commentPublicId: string
    deletedAt: Date
    deletedByUserPublicId: string
  }): Promise<ProjectImpedimentCommentState | null> {
    const res = await this.prisma.projectImpedimentComment.updateMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        impediment_public_id: input.impedimentPublicId,
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
    const row = await this.prisma.projectImpedimentComment.findFirst({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        public_id: input.commentPublicId,
      },
    })
    return row ? docToProjectImpedimentCommentState(rowToDoc(row)) : null
  }
}
