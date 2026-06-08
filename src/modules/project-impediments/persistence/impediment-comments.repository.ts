import type { ProjectImpedimentCommentState } from "../domain/project-impediment-comment.js"

export type ListProjectImpedimentCommentsCursor = {
  createdAt: Date
  commentPublicId: string
}

export interface ProjectImpedimentCommentsRepository {
  insert(comment: ProjectImpedimentCommentState): Promise<void>
  findActiveByIds(
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    commentPublicId: string,
  ): Promise<ProjectImpedimentCommentState | null>
  listActivePage(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    limit: number
    after: ListProjectImpedimentCommentsCursor | null
  }): Promise<ProjectImpedimentCommentState[]>
  updateBody(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    commentPublicId: string
    body: string
    updatedAt: Date
  }): Promise<ProjectImpedimentCommentState | null>
  softDelete(input: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    commentPublicId: string
    deletedAt: Date
    deletedByUserPublicId: string
  }): Promise<ProjectImpedimentCommentState | null>
}
