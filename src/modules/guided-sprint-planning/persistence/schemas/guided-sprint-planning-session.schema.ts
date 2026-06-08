import { OPERATIONAL_APPROACHES } from "../../../workspace-project-runtime/domain/operational-approach.js"
import {
  BUFFER_MODES,
  CAPACITY_UNITS,
  type GuidedSprintPlanningSessionState,
  type GuidedSprintPlanningTranscriptAfterClose,
} from "../../domain/guided-sprint-planning-session.js"

export interface GuidedSprintPlanningSessionDocProps {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sprintPublicId: string | null
  sessionDate: string
  sessionSlot: string
  operationalApproach: (typeof OPERATIONAL_APPROACHES)[number]
  operationalTimeZone: string
  planningMode: "guided_sprint_planning" | "flow_commitment_window"
  facilitatorUserPublicId: string | null
  productOwnerUserPublicId: string | null
  status: GuidedSprintPlanningSessionState["status"]
  planningGoalDraft: string | null
  sprintGoalFinal: string | null
  summary: string | null
  agreements: string[]
  followUps: string[]
  capacityTotal: number | null
  capacityUnit: (typeof CAPACITY_UNITS)[number] | null
  bufferReserved: number | null
  bufferMode: (typeof BUFFER_MODES)[number] | null
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
