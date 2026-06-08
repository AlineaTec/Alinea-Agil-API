import type { GuidedRetrospectiveContributionState } from "../domain/guided-retrospective-contribution.js"

export type GuidedRetrospectiveContributionRepository = {
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveContributionState[]>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    contributionPublicId: string,
  ): Promise<GuidedRetrospectiveContributionState | null>
  insert(row: GuidedRetrospectiveContributionState): Promise<void>
  updateTopicAssignment(
    workspacePublicId: string,
    projectPublicId: string,
    contributionPublicId: string,
    patch: {
      topicPublicId: string | null
      topicStatus: GuidedRetrospectiveContributionState["topicStatus"]
      updatedAt: Date
    },
  ): Promise<GuidedRetrospectiveContributionState | null>
  countBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<number>
}
