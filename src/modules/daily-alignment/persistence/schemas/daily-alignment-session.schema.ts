import { OPERATIONAL_APPROACHES } from "../../../workspace-project-runtime/domain/operational-approach.js"

export type DailyAlignmentSessionDocProps = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  operationalApproach: (typeof OPERATIONAL_APPROACHES)[number]
  operationalTimeZone: string
  alignmentMode: "live" | "async"
  facilitatorUserPublicId: string | null
  status: "open" | "closed" | "closed_incomplete"
  startedAt: Date | null
  closedAt: Date | null
  closeoutSummary: string | null
  facilitatorTranscript: string | null
  agreements: string[]
  escalatedImpediments: string[]
  followUps: string[]
  createdAt: Date
  updatedAt: Date
}
