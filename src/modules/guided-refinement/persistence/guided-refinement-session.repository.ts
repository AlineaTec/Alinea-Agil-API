import type { GuidedRefinementSessionState } from "../domain/guided-refinement-session.js"

export type GuidedRefinementSessionRepository = {
  findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedRefinementSessionState | null>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRefinementSessionState | null>
  insert(state: GuidedRefinementSessionState): Promise<void>
  updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      focusSummary: string | null
      candidateWorkItemPublicIds: string[]
      refinementMode: GuidedRefinementSessionState["refinementMode"]
      facilitatorUserPublicId: string | null
      productOwnerUserPublicId: string | null
      sprintPublicId: string | null
      updatedAt: Date
    },
  ): Promise<GuidedRefinementSessionState | null>
  updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: {
      reviewedItemCount: number
      readyForPlanningCount: number
      pendingCandidateReviewCount: number
      reviewedNotReadyCount: number
      updatedAt: Date
    },
  ): Promise<void>
  updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      status: GuidedRefinementSessionState["status"]
      closedAt: Date
      closeSummary: string | null
      agreements: string[]
      followUps: string[]
      openQuestions: string[]
      facilitatorUserPublicId: string | null
      reviewedItemCount: number
      readyForPlanningCount: number
      pendingCandidateReviewCount: number
      reviewedNotReadyCount: number
      updatedAt: Date
    },
  ): Promise<GuidedRefinementSessionState | null>
  appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: string,
    updatedAt: Date,
  ): Promise<GuidedRefinementSessionState | null>
  listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedRefinementSessionState[]>
  listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedRefinementSessionState[]>
}
