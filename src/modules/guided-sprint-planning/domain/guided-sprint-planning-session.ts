import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { GuidedSprintPlanningMode } from "./guided-sprint-planning-support-level.js"

export const GUIDED_SPRINT_PLANNING_DEFAULT_SLOT = "default" as const

export type GuidedSprintPlanningSessionStatus =
  | "open"
  | "closed"
  | "closed_with_warnings"
  | "closed_without_baseline"

export const CAPACITY_UNITS = [
  "story_points",
  "person_days",
  "hours",
  "item_count",
  "custom_label",
] as const

export type CapacityUnit = (typeof CAPACITY_UNITS)[number]

export const BUFFER_MODES = ["absolute", "percent"] as const

export type BufferMode = (typeof BUFFER_MODES)[number]

/** Transcripción registrada al cierre o tras él (un solo bloque; se sustituye al guardar). */
export type GuidedSprintPlanningTranscriptAfterClose = {
  text: string
  updatedAt: Date
  updatedByUserPublicId: string
}

export type GuidedSprintPlanningSessionState = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  sessionDate: string
  sessionSlot: string
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  planningMode: GuidedSprintPlanningMode
  facilitatorUserPublicId: string | null
  productOwnerUserPublicId: string | null
  status: GuidedSprintPlanningSessionStatus
  planningGoalDraft: string | null
  sprintGoalFinal: string | null
  summary: string | null
  agreements: string[]
  followUps: string[]
  capacityTotal: number | null
  capacityUnit: CapacityUnit | null
  bufferReserved: number | null
  bufferMode: BufferMode | null
  candidateItemCount: number
  committedItemCount: number
  excludedItemCount: number
  pendingDecisionCount: number
  planningWarnings: string[]
  baselineCreated: boolean
  baselinePublicId: string | null
  additiveNotesAfterClose: string[]
  transcriptAfterClose: GuidedSprintPlanningTranscriptAfterClose | null
  startedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
