export type GuidedRetrospectiveVoteState = {
  votePublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  topicPublicId: string
  userPublicId: string
  /** Peso / adhesivos en ese tema (v1: 1 salvo plantilla allowMultiple). */
  stickerWeight: number
  createdAt: Date
  updatedAt: Date
}
