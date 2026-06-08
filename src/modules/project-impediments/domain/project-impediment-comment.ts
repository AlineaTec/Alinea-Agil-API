export type ProjectImpedimentCommentState = {
  commentPublicId: string
  workspacePublicId: string
  projectPublicId: string
  impedimentPublicId: string
  body: string
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deletedByUserPublicId: string | null
}
