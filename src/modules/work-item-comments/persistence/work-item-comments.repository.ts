import type { WorkItemCommentState } from "../domain/work-item-comment.js"

export type ListCommentsCursor = {
  createdAt: Date
  commentPublicId: string
}

export type WorkItemCommentsRepository = {
  insert(comment: WorkItemCommentState): Promise<void>
  findActiveByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    commentPublicId: string,
  ): Promise<WorkItemCommentState | null>
  listActivePage(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    limit: number
    after: ListCommentsCursor | null
  }): Promise<WorkItemCommentState[]>
  updateBody(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    body: string
    updatedAt: Date
  }): Promise<WorkItemCommentState | null>
  softDelete(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    deletedAt: Date
    deletedByUserPublicId: string
  }): Promise<WorkItemCommentState | null>
}
