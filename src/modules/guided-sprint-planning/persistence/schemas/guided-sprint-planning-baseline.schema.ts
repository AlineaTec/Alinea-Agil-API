import { CAPACITY_UNITS } from "../../domain/guided-sprint-planning-session.js"
import type { GuidedSprintPlanningBaselineState } from "../../domain/guided-sprint-planning-baseline.js"

export interface GuidedSprintPlanningBaselineDocProps {
  baselinePublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  sprintGoal: string | null
  committedWorkItemPublicIds: string[]
  capacityTotal: number | null
  capacityUnit: (typeof CAPACITY_UNITS)[number] | null
  bufferReserved: number | null
  knownRisks: string[]
  knownDependencies: string[]
  baselineWarnings: string[]
  createdAt: Date
  createdByUserPublicId: string
}

export type { GuidedSprintPlanningBaselineState }
