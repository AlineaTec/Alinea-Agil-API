import type {
  GuidedRetrospectiveSessionState,
  GuidedRetrospectiveAdditiveNote,
  GuidedRetrospectiveTranscriptAfterClose,
} from "../domain/guided-retrospective-session.js"

export type GuidedRetrospectiveSessionRepository = {
  findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedRetrospectiveSessionState | null>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveSessionState | null>
  findOpenBySessionCodeInWorkspace(
    workspacePublicId: string,
    sessionCode: string,
  ): Promise<GuidedRetrospectiveSessionState | null>
  /** Primera sesión abierta con ese código en cualquier workspace (anti-adivinación acotado por Turnstile + rate limit). */
  findOpenBySessionCodeGlobally(sessionCode: string): Promise<GuidedRetrospectiveSessionState | null>
  insert(state: GuidedRetrospectiveSessionState): Promise<void>
  updateHeaderWhenWritable(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Partial<
      Pick<
        GuidedRetrospectiveSessionState,
        | "retrospectiveMode"
        | "facilitatorUserPublicId"
        | "templateKey"
        | "votesPerParticipant"
        | "allowMultipleVotesPerTopic"
        | "defaultContributionVisibility"
        | "goalSummary"
        | "sprintPublicId"
        | "retrospectivePeriod"
        | "contextHints"
        | "sessionCode"
        | "status"
        | "startedAt"
        | "participantUserPublicIds"
        | "participantWithContributionUserPublicIds"
        | "participantCount"
        | "participantWithContributionCount"
        | "contributionCount"
        | "topicCount"
        | "voteRecordCount"
        | "sessionVoteStickerTotal"
      >
    > & { updatedAt: Date },
  ): Promise<GuidedRetrospectiveSessionState | null>
  updateDenormalizedCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: {
      contributionCount: number
      topicCount: number
      voteRecordCount: number
      sessionVoteStickerTotal: number
      participantCount: number
      participantWithContributionCount: number
      updatedAt: Date
    },
  ): Promise<void>
  closeSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      status: "closed" | "closed_without_actions"
      closedAt: Date
      summary: string | null
      agreements: string[]
      facilitatorUserPublicId: string | null
      sessionCode: null
      updatedAt: Date
    },
  ): Promise<GuidedRetrospectiveSessionState | null>
  upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedRetrospectiveTranscriptAfterClose | null,
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveSessionState | null>
  appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: GuidedRetrospectiveAdditiveNote,
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveSessionState | null>
  listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedRetrospectiveSessionState[]>
  listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedRetrospectiveSessionState[]>
}
