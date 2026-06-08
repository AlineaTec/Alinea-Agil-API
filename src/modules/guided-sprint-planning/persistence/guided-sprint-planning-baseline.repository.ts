import type { GuidedSprintPlanningBaselineState } from "../domain/guided-sprint-planning-baseline.js"

export type GuidedSprintPlanningBaselineRepository = {
  insert(state: GuidedSprintPlanningBaselineState): Promise<void>
  findBySessionPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedSprintPlanningBaselineState | null>
  findLatestBySprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<GuidedSprintPlanningBaselineState | null>
}
