import { Prisma, type PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedSprintPlanningSessionState } from "../../domain/guided-sprint-planning-session.js"
import type { GuidedSprintPlanningSessionRepository } from "../guided-sprint-planning-session.repository.js"
import { sessionRowToState, sessionStateToCreate } from "./guided-sprint-planning-session.prisma-mapper.js"

const CLOSED_STATUSES = ["closed", "closed_with_warnings", "closed_without_baseline"] as const

/** PostgreSQL: `guided_sprint_planning_sessions`. */
export class GuidedSprintPlanningSessionPrismaRepository implements GuidedSprintPlanningSessionRepository {
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

  async findBySprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const row = await this.prisma.guidedSprintPlanningSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
      },
    })
    return row ? sessionRowToState(row) : null
  }

  async findByFlowKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const row = await this.prisma.guidedSprintPlanningSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: sessionDate,
        session_slot: sessionSlot,
        sprint_public_id: null,
      },
    })
    return row ? sessionRowToState(row) : null
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const row = await this.prisma.guidedSprintPlanningSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
    })
    return row ? sessionRowToState(row) : null
  }

  async insert(state: GuidedSprintPlanningSessionState): Promise<void> {
    const ids = await this.resolveIds(
      state.workspacePublicId,
      state.projectPublicId,
      state.sprintPublicId,
    )
    if (!ids) throw new Error("guided_planning_session_insert_context_not_found")
    await this.prisma.guidedSprintPlanningSession.create({
      data: sessionStateToCreate(state, ids),
    })
  }

  async updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedSprintPlanningSessionRepository["updateHeaderIfOpen"]>[3],
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const res = await this.prisma.guidedSprintPlanningSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: {
        planning_goal_draft: patch.planningGoalDraft,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        product_owner_user_public_id: patch.productOwnerUserPublicId,
        capacity_total: patch.capacityTotal,
        capacity_unit: patch.capacityUnit,
        buffer_reserved: patch.bufferReserved,
        buffer_mode: patch.bufferMode,
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
    counts: Parameters<GuidedSprintPlanningSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    await this.prisma.guidedSprintPlanningSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
      data: {
        candidate_item_count: counts.candidateItemCount,
        committed_item_count: counts.committedItemCount,
        excluded_item_count: counts.excludedItemCount,
        pending_decision_count: counts.pendingDecisionCount,
        updated_at: counts.updatedAt,
      },
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedSprintPlanningSessionRepository["updateCloseoutAndStatus"]>[3],
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const res = await this.prisma.guidedSprintPlanningSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: {
        status: patch.status,
        sprint_goal_final: patch.sprintGoalFinal,
        summary: patch.summary,
        agreements: patch.agreements,
        follow_ups: patch.followUps,
        planning_warnings: patch.planningWarnings,
        baseline_created: patch.baselineCreated,
        baseline_public_id: patch.baselinePublicId,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        candidate_item_count: patch.candidateItemCount,
        committed_item_count: patch.committedItemCount,
        excluded_item_count: patch.excludedItemCount,
        pending_decision_count: patch.pendingDecisionCount,
        closed_at: patch.closedAt,
        transcript_after_close: patch.transcriptAfterClose
          ? (patch.transcriptAfterClose as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedSprintPlanningSessionState["transcriptAfterClose"],
    updatedAt: Date,
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const res = await this.prisma.guidedSprintPlanningSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: [...CLOSED_STATUSES] },
      },
      data: {
        transcript_after_close: transcript
          ? (transcript as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        updated_at: updatedAt,
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
  ): Promise<GuidedSprintPlanningSessionState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!existing || !CLOSED_STATUSES.includes(existing.status as (typeof CLOSED_STATUSES)[number])) {
      return null
    }
    const res = await this.prisma.guidedSprintPlanningSession.updateMany({
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
  ): Promise<GuidedSprintPlanningSessionState[]> {
    const rows = await this.prisma.guidedSprintPlanningSession.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: [{ session_date: "desc" }, { updated_at: "desc" }],
      take: limit,
    })
    return rows.map(sessionRowToState)
  }

  async listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedSprintPlanningSessionState[]> {
    const rows = await this.prisma.guidedSprintPlanningSession.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: { gte: sessionDateFromInclusive, lte: sessionDateToInclusive },
      },
      orderBy: [{ session_date: "asc" }, { session_slot: "asc" }, { updated_at: "asc" }],
    })
    return rows.map(sessionRowToState)
  }
}
