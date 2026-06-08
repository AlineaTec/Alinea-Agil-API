import type { Prisma, GuidedSprintPlanningSession } from "@prisma/client"
import type { GuidedSprintPlanningSessionState } from "../../domain/guided-sprint-planning-session.js"

export function sessionRowToState(row: GuidedSprintPlanningSession): GuidedSprintPlanningSessionState {
  const transcript = row.transcript_after_close as {
    text: string
    updatedAt: string | Date
    updatedByUserPublicId: string
  } | null
  return {
    sessionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sprintPublicId: row.sprint_public_id,
    sessionDate: row.session_date,
    sessionSlot: row.session_slot,
    operationalApproach: row.operational_approach as GuidedSprintPlanningSessionState["operationalApproach"],
    operationalTimeZone: row.operational_time_zone,
    planningMode: row.planning_mode as GuidedSprintPlanningSessionState["planningMode"],
    facilitatorUserPublicId: row.facilitator_user_public_id,
    productOwnerUserPublicId: row.product_owner_user_public_id,
    status: row.status,
    planningGoalDraft: row.planning_goal_draft,
    sprintGoalFinal: row.sprint_goal_final,
    summary: row.summary,
    agreements: [...row.agreements],
    followUps: [...row.follow_ups],
    capacityTotal: row.capacity_total,
    capacityUnit: row.capacity_unit as GuidedSprintPlanningSessionState["capacityUnit"],
    bufferReserved: row.buffer_reserved,
    bufferMode: row.buffer_mode as GuidedSprintPlanningSessionState["bufferMode"],
    candidateItemCount: row.candidate_item_count,
    committedItemCount: row.committed_item_count,
    excludedItemCount: row.excluded_item_count,
    pendingDecisionCount: row.pending_decision_count,
    planningWarnings: [...row.planning_warnings],
    baselineCreated: row.baseline_created,
    baselinePublicId: row.baseline_public_id,
    additiveNotesAfterClose: [...row.additive_notes_after_close],
    transcriptAfterClose: transcript
      ? {
          text: transcript.text,
          updatedAt:
            transcript.updatedAt instanceof Date ? transcript.updatedAt : new Date(transcript.updatedAt),
          updatedByUserPublicId: transcript.updatedByUserPublicId,
        }
      : null,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function sessionStateToCreate(
  state: GuidedSprintPlanningSessionState,
  ids: { workspaceId: string; projectId: string; sprintId: string | null },
): Prisma.GuidedSprintPlanningSessionUncheckedCreateInput {
  return {
    public_id: state.sessionPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: state.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: state.projectPublicId,
    sprint_id: ids.sprintId,
    sprint_public_id: state.sprintPublicId,
    session_date: state.sessionDate,
    session_slot: state.sessionSlot,
    operational_approach: state.operationalApproach,
    operational_time_zone: state.operationalTimeZone,
    planning_mode: state.planningMode,
    facilitator_user_public_id: state.facilitatorUserPublicId,
    product_owner_user_public_id: state.productOwnerUserPublicId,
    status: state.status,
    planning_goal_draft: state.planningGoalDraft,
    sprint_goal_final: state.sprintGoalFinal,
    summary: state.summary,
    agreements: state.agreements,
    follow_ups: state.followUps,
    capacity_total: state.capacityTotal,
    capacity_unit: state.capacityUnit,
    buffer_reserved: state.bufferReserved,
    buffer_mode: state.bufferMode,
    candidate_item_count: state.candidateItemCount,
    committed_item_count: state.committedItemCount,
    excluded_item_count: state.excludedItemCount,
    pending_decision_count: state.pendingDecisionCount,
    planning_warnings: state.planningWarnings,
    baseline_created: state.baselineCreated,
    baseline_public_id: state.baselinePublicId,
    additive_notes_after_close: state.additiveNotesAfterClose,
    transcript_after_close: state.transcriptAfterClose
      ? (state.transcriptAfterClose as Prisma.InputJsonValue)
      : undefined,
    started_at: state.startedAt,
    closed_at: state.closedAt,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}
