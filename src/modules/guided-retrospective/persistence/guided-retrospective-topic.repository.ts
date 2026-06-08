import type { GuidedRetrospectiveTopicState } from "../domain/guided-retrospective-topic.js"

export type GuidedRetrospectiveTopicRepository = {
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveTopicState[]>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveTopicState | null>
  insert(topic: GuidedRetrospectiveTopicState): Promise<void>
  updateTitleAndSort(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    patch: { title?: string; sortOrder?: number; updatedAt: Date },
  ): Promise<GuidedRetrospectiveTopicState | null>
  updateVoteAggregates(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    patch: { voteCount: number; voteStickerTotal: number; updatedAt: Date },
  ): Promise<void>
  deleteTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<void>
}
