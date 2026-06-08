import type { CapacityUnit } from "./guided-sprint-planning-session.js"

export type GuidedSprintPlanningBaselineState = {
  baselinePublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  sprintGoal: string | null
  committedWorkItemPublicIds: string[]
  capacityTotal: number | null
  capacityUnit: CapacityUnit | null
  bufferReserved: number | null
  knownRisks: string[]
  knownDependencies: string[]
  baselineWarnings: string[]
  createdAt: Date
  createdByUserPublicId: string
}
