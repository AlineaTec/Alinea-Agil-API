import type { DailyAlignmentParticipantUpdateState } from "../domain/daily-alignment-session.js"

export type UpsertDailyAlignmentParticipantInput = {
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
  sourceMode: DailyAlignmentParticipantUpdateState["sourceMode"]
  isSubmitted: boolean
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type DailyAlignmentParticipantUpdateRepository = {
  findBySessionAndUser(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<DailyAlignmentParticipantUpdateState | null>
  listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<DailyAlignmentParticipantUpdateState[]>
  upsert(input: UpsertDailyAlignmentParticipantInput): Promise<DailyAlignmentParticipantUpdateState>
}
