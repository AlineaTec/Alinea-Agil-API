import type {
  DailyAlignmentMode,
  DailyAlignmentSessionState,
  DailyAlignmentSessionStatus,
} from "../domain/daily-alignment-session.js"

export type InsertDailyAlignmentSessionInput = DailyAlignmentSessionState

export type DailyAlignmentSessionRepository = {
  findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<DailyAlignmentSessionState | null>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<DailyAlignmentSessionState | null>
  insert(state: InsertDailyAlignmentSessionInput): Promise<void>
  updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      status: DailyAlignmentSessionStatus
      closedAt: Date
      closeoutSummary: string
      agreements: string[]
      escalatedImpediments: string[]
      followUps: string[]
      facilitatorUserPublicId: string
      updatedAt: Date
    },
  ): Promise<DailyAlignmentSessionState | null>
  updateAlignmentModeIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    alignmentMode: DailyAlignmentMode,
    updatedAt: Date,
  ): Promise<DailyAlignmentSessionState | null>
  updateFacilitatorTranscriptIfClosed(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    facilitatorTranscript: string | null,
    updatedAt: Date,
  ): Promise<DailyAlignmentSessionState | null>
  listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<DailyAlignmentSessionState[]>
  listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<DailyAlignmentSessionState[]>
}
