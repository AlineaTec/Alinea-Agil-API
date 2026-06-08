import type {
  GuidedReviewSessionState,
  GuidedReviewAdditiveNote,
  GuidedReviewTranscriptAfterClose,
} from "../domain/guided-review-session.js"

export type GuidedReviewSessionRepository = {
  findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedReviewSessionState | null>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedReviewSessionState | null>
  insert(state: GuidedReviewSessionState): Promise<void>
  updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      reviewGoalSummary: string | null
      reviewMode: GuidedReviewSessionState["reviewMode"]
      facilitatorUserPublicId: string | null
      productOwnerUserPublicId: string | null
      sprintPublicId: string | null
      updatedAt: Date
    },
  ): Promise<GuidedReviewSessionState | null>
  updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: {
      demonstratedItemCount: number
      feedbackCount: number
      backlogImpactCount: number
      updatedAt: Date
    },
  ): Promise<void>
  updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      status: GuidedReviewSessionState["status"]
      closedAt: Date
      closeSummary: string | null
      agreements: string[]
      followUps: string[]
      stakeholderSummary: string | null
      openQuestionsRemaining: string[]
      methodologicalNotes: string | null
      incrementAssessment: string | null
      sprintGoalAssessment: GuidedReviewSessionState["sprintGoalAssessment"]
      sprintGoalAssessmentExplanation: string | null
      facilitatorUserPublicId: string | null
      demonstratedItemCount: number
      feedbackCount: number
      backlogImpactCount: number
      updatedAt: Date
    },
  ): Promise<GuidedReviewSessionState | null>
  appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: GuidedReviewAdditiveNote,
    updatedAt: Date,
  ): Promise<GuidedReviewSessionState | null>
  upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedReviewTranscriptAfterClose | null,
    updatedAt: Date,
  ): Promise<GuidedReviewSessionState | null>
  listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedReviewSessionState[]>
  listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedReviewSessionState[]>
}
