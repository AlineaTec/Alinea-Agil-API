import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export const DAILY_ALIGNMENT_DEFAULT_SLOT = "default" as const
export type DailyAlignmentSessionSlot = string

export type DailyAlignmentSessionStatus = "open" | "closed" | "closed_incomplete"

export type DailyAlignmentMode = "live" | "async"

export type DailyAlignmentSessionState = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  alignmentMode: DailyAlignmentMode
  facilitatorUserPublicId: string | null
  status: DailyAlignmentSessionStatus
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

export type DailyAlignmentParticipantSourceMode = "manual" | "confirmed_from_suggestion" | "mixed"

export type DailyAlignmentParticipantUpdateState = {
  participantUpdatePublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  userPublicId: string
  yesterdaySummary: string
  todayPlan: string
  impediments: string
  suggestionBasisSnapshot: unknown | null
  consistencyHintsSnapshot: unknown | null
  sourceMode: DailyAlignmentParticipantSourceMode
  isSubmitted: boolean
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
