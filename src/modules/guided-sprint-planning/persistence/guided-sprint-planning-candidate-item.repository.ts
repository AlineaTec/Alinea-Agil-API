import type { GuidedSprintPlanningCandidateItemState } from "../domain/guided-sprint-planning-candidate-item.js"

export type GuidedSprintPlanningCandidateItemRepository = {
  findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedSprintPlanningCandidateItemState | null>
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedSprintPlanningCandidateItemState[]>
  upsert(state: GuidedSprintPlanningCandidateItemState): Promise<void>
  deleteBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<boolean>
}
