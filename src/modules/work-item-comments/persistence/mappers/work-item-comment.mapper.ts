import type { WorkItemCommentState } from "../../domain/work-item-comment.js"
import type { WorkItemCommentDocProps } from "../schemas/work-item-comment.schema.js"

export function docToWorkItemCommentState(doc: WorkItemCommentDocProps): WorkItemCommentState {
  return {
    commentPublicId: doc.commentPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    backlogItemPublicId: doc.backlogItemPublicId,
    body: doc.body,
    createdByUserPublicId: doc.createdByUserPublicId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt ?? null,
    deletedByUserPublicId: doc.deletedByUserPublicId ?? null,
  }
}
