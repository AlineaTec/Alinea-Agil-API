export type WorkItemCommentState = {
  commentPublicId: string
  workspacePublicId: string
  projectPublicId: string
  backlogItemPublicId: string
  body: string
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deletedByUserPublicId: string | null
}
