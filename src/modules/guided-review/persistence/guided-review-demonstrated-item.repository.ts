import type { GuidedReviewDemonstratedItemState } from "../domain/guided-review-demonstrated-item.js"

export type GuidedReviewDemonstratedItemRepository = {
  findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedReviewDemonstratedItemState | null>
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedReviewDemonstratedItemState[]>
  upsert(state: GuidedReviewDemonstratedItemState): Promise<void>
  findLatestForWorkItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string    
  ): Promise<{ item: GuidedReviewDemonstratedItemState; sessionPublicId: string; sessionDate: string } | null>
}
