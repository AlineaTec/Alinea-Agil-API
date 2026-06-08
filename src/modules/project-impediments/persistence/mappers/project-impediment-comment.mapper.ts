import type { ProjectImpedimentCommentState } from "../../domain/project-impediment-comment.js"
import type { ProjectImpedimentCommentDocProps } from "../schemas/project-impediment-comment.schema.js"

export function docToProjectImpedimentCommentState(doc: ProjectImpedimentCommentDocProps): ProjectImpedimentCommentState {
  return {
    commentPublicId: doc.commentPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    impedimentPublicId: doc.impedimentPublicId,
    body: doc.body,
    createdByUserPublicId: doc.createdByUserPublicId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    deletedByUserPublicId: doc.deletedByUserPublicId,
  }
}
