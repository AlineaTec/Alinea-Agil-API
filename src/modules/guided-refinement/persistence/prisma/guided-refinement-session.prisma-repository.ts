import { type PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedRefinementSessionState } from "../../domain/guided-refinement-session.js"
import type { GuidedRefinementSessionRepository } from "../guided-refinement-session.repository.js"
import type { GuidedRefinementSession } from "@prisma/client"

const CLOSED_STATUSES = ["closed", "closed_without_decisions"] as const

function rowToState(row: GuidedRefinementSession): GuidedRefinementSessionState {
  return {
    sessionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    sessionSlot: row.session_slot,
    sprintPublicId: row.sprint_public_id,
    operationalApproach: row.operational_approach as GuidedRefinementSessionState["operationalApproach"],
    operationalTimeZone: row.operational_time_zone,
    refinementMode: row.refinement_mode as GuidedRefinementSessionState["refinementMode"],
    facilitatorUserPublicId: row.facilitator_user_public_id,
    productOwnerUserPublicId: row.product_owner_user_public_id,
    status: row.status as GuidedRefinementSessionState["status"],
    focusSummary: row.focus_summary,
    candidateWorkItemPublicIds: [...row.candidate_work_item_public_ids],
    closeSummary: row.close_summary,
    agreements: [...row.agreements],
    followUps: [...row.follow_ups],
    openQuestions: [...row.open_questions],
    additiveNotesAfterClose: [...row.additive_notes_after_close],
    reviewedItemCount: row.reviewed_item_count,
    readyForPlanningCount: row.ready_for_planning_count,
    pendingCandidateReviewCount: row.pending_candidate_review_count,
    reviewedNotReadyCount: row.reviewed_not_ready_count,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stateToCreate(
  state: GuidedRefinementSessionState,
  ids: { workspaceId: string; projectId: string; sprintId: string | null },
) {
  return {
    public_id: state.sessionPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: state.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: state.projectPublicId,
    session_date: state.sessionDate,
    session_slot: state.sessionSlot,
    sprint_id: ids.sprintId,
    sprint_public_id: state.sprintPublicId,
    operational_approach: state.operationalApproach,
    operational_time_zone: state.operationalTimeZone,
    refinement_mode: state.refinementMode,
    facilitator_user_public_id: state.facilitatorUserPublicId,
    product_owner_user_public_id: state.productOwnerUserPublicId,
    status: state.status,
    focus_summary: state.focusSummary,
    candidate_work_item_public_ids: state.candidateWorkItemPublicIds,
    close_summary: state.closeSummary,
    agreements: state.agreements,
    follow_ups: state.followUps,
    open_questions: state.openQuestions,
    additive_notes_after_close: state.additiveNotesAfterClose,
    reviewed_item_count: state.reviewedItemCount,
    ready_for_planning_count: state.readyForPlanningCount,
    pending_candidate_review_count: state.pendingCandidateReviewCount,
    reviewed_not_ready_count: state.reviewedNotReadyCount,
    started_at: state.startedAt,
    closed_at: state.closedAt,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}

/** PostgreSQL: `guided_refinement_sessions`. */
export class GuidedRefinementSessionPrismaRepository implements GuidedRefinementSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveIds(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string | null,
  ): Promise<{ workspaceId: string; projectId: string; sprintId: string | null } | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    if (!workspaceId || !projectId) return null
    const sprintId = sprintPublicId
      ? await resolveSprintId(this.prisma, workspacePublicId, projectPublicId, sprintPublicId)
      : null
    if (sprintPublicId && !sprintId) return null
    return { workspaceId, projectId, sprintId }
  }

  async findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedRefinementSessionState | null> {
    const row = await this.prisma.guidedRefinementSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: sessionDate,
        session_slot: sessionSlot,
      },
    })
    return row ? rowToState(row) : null
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRefinementSessionState | null> {
    const row = await this.prisma.guidedRefinementSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async insert(state: GuidedRefinementSessionState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId, state.sprintPublicId)
    if (!ids) throw new Error("guided_refinement_session_insert_context_not_found")
    await this.prisma.guidedRefinementSession.create({
      data: stateToCreate(state, ids),
    })
  }

  async updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRefinementSessionRepository["updateHeaderIfOpen"]>[3],
  ): Promise<GuidedRefinementSessionState | null> {
    const sprintId = patch.sprintPublicId
      ? await resolveSprintId(this.prisma, workspacePublicId, projectPublicId, patch.sprintPublicId)
      : null
    if (patch.sprintPublicId && !sprintId) return null

    const res = await this.prisma.guidedRefinementSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: {
        focus_summary: patch.focusSummary,
        candidate_work_item_public_ids: patch.candidateWorkItemPublicIds,
        refinement_mode: patch.refinementMode,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        product_owner_user_public_id: patch.productOwnerUserPublicId,
        sprint_public_id: patch.sprintPublicId,
        sprint_id: sprintId,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: Parameters<GuidedRefinementSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    await this.prisma.guidedRefinementSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
      data: {
        reviewed_item_count: counts.reviewedItemCount,
        ready_for_planning_count: counts.readyForPlanningCount,
        pending_candidate_review_count: counts.pendingCandidateReviewCount,
        reviewed_not_ready_count: counts.reviewedNotReadyCount,
        updated_at: counts.updatedAt,
      },
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRefinementSessionRepository["updateCloseoutAndStatus"]>[3],
  ): Promise<GuidedRefinementSessionState | null> {
    const res = await this.prisma.guidedRefinementSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: {
        status: patch.status,
        closed_at: patch.closedAt,
        close_summary: patch.closeSummary,
        agreements: patch.agreements,
        follow_ups: patch.followUps,
        open_questions: patch.openQuestions,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        reviewed_item_count: patch.reviewedItemCount,
        ready_for_planning_count: patch.readyForPlanningCount,
        pending_candidate_review_count: patch.pendingCandidateReviewCount,
        reviewed_not_ready_count: patch.reviewedNotReadyCount,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: string,
    updatedAt: Date,
  ): Promise<GuidedRefinementSessionState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!existing || !CLOSED_STATUSES.includes(existing.status as (typeof CLOSED_STATUSES)[number])) {
      return null
    }
    const res = await this.prisma.guidedRefinementSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: [...CLOSED_STATUSES] },
      },
      data: {
        additive_notes_after_close: [...existing.additiveNotesAfterClose, note],
        updated_at: updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedRefinementSessionState[]> {
    const rows = await this.prisma.guidedRefinementSession.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: [{ session_date: "desc" }, { updated_at: "desc" }],
      take: limit,
    })
    return rows.map(rowToState)
  }

  async listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedRefinementSessionState[]> {
    const rows = await this.prisma.guidedRefinementSession.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: { gte: sessionDateFromInclusive, lte: sessionDateToInclusive },
      },
      orderBy: [{ session_date: "asc" }, { session_slot: "asc" }, { updated_at: "asc" }],
    })
    return rows.map(rowToState)
  }
}
