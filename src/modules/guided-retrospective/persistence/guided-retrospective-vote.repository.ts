import type { GuidedRetrospectiveVoteState } from "../domain/guided-retrospective-vote.js"

export type GuidedRetrospectiveVoteRepository = {
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]>
  listBySessionAndUser(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]>
  findUserVoteOnTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState | null>
  upsertVote(row: GuidedRetrospectiveVoteState): Promise<void>
  deleteVote(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
    topicPublicId: string,
  ): Promise<void>
  deleteVotesForTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<void>
  listBySessionAndTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]>
  aggregateForSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<{ voteRecordCount: number; sessionVoteStickerTotal: number }>
}
