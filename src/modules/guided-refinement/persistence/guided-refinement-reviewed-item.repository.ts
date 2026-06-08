import type { GuidedRefinementReviewedItemState } from "../domain/guided-refinement-reviewed-item.js"

export type GuidedRefinementReviewedItemRepository = {
  findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState | null>
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState[]>
  upsert(state: GuidedRefinementReviewedItemState): Promise<void>
  findLatestForWorkItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState | null>
  /** Última revisión operativa por ítem: `reviewStatus=reviewed` y `readyForPlanning=true` (OQ-POS-06). */
  countDistinctWorkItemsLatestReadyForPlanning(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<number>
}
