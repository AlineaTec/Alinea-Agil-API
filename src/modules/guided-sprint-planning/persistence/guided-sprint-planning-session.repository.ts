import type { GuidedSprintPlanningSessionState } from "../domain/guided-sprint-planning-session.js"

export type GuidedSprintPlanningSessionRepository = {
  findBySprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<GuidedSprintPlanningSessionState | null>
  findByFlowKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedSprintPlanningSessionState | null>
  findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedSprintPlanningSessionState | null>
  insert(state: GuidedSprintPlanningSessionState): Promise<void>
  updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      planningGoalDraft: string | null
      facilitatorUserPublicId: string | null
      productOwnerUserPublicId: string | null
      capacityTotal: number | null
      capacityUnit: GuidedSprintPlanningSessionState["capacityUnit"]
      bufferReserved: number | null
      bufferMode: GuidedSprintPlanningSessionState["bufferMode"]
      updatedAt: Date
    },
  ): Promise<GuidedSprintPlanningSessionState | null>
  updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: {
      candidateItemCount: number
      committedItemCount: number
      excludedItemCount: number
      pendingDecisionCount: number
      updatedAt: Date
    },
  ): Promise<void>
  updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: {
      status: GuidedSprintPlanningSessionState["status"]
      sprintGoalFinal: string | null
      summary: string | null
      agreements: string[]
      followUps: string[]
      planningWarnings: string[]
      baselineCreated: boolean
      baselinePublicId: string | null
      facilitatorUserPublicId: string | null
      candidateItemCount: number
      committedItemCount: number
      excludedItemCount: number
      pendingDecisionCount: number
      closedAt: Date
      transcriptAfterClose: GuidedSprintPlanningSessionState["transcriptAfterClose"]
      updatedAt: Date
    },
  ): Promise<GuidedSprintPlanningSessionState | null>
  upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedSprintPlanningSessionState["transcriptAfterClose"],
    updatedAt: Date,
  ): Promise<GuidedSprintPlanningSessionState | null>
  appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: string,
    updatedAt: Date,
  ): Promise<GuidedSprintPlanningSessionState | null>
  listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedSprintPlanningSessionState[]>
  listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedSprintPlanningSessionState[]>
}
