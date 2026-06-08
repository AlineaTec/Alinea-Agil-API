import { type PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { DailyAlignmentSessionState } from "../../domain/daily-alignment-session.js"
import type { DailyAlignmentSessionRepository } from "../daily-alignment-session.repository.js"
import type { DailyAlignmentSession } from "@prisma/client"

const CLOSED_STATUSES = ["closed", "closed_incomplete"] as const

function rowToState(row: DailyAlignmentSession): DailyAlignmentSessionState {
  return {
    sessionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    sessionSlot: row.session_slot,
    sprintPublicId: row.sprint_public_id,
    operationalApproach: row.operational_approach as DailyAlignmentSessionState["operationalApproach"],
    operationalTimeZone: row.operational_time_zone,
    alignmentMode: row.alignment_mode as DailyAlignmentSessionState["alignmentMode"],
    facilitatorUserPublicId: row.facilitator_user_public_id,
    status: row.status as DailyAlignmentSessionState["status"],
    startedAt: row.started_at,
    closedAt: row.closed_at,
    closeoutSummary: row.closeout_summary,
    facilitatorTranscript: row.facilitator_transcript ?? null,
    agreements: [...row.agreements],
    escalatedImpediments: [...row.escalated_impediments],
    followUps: [...row.follow_ups],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stateToCreate(
  state: DailyAlignmentSessionState,
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
    alignment_mode: state.alignmentMode,
    facilitator_user_public_id: state.facilitatorUserPublicId,
    status: state.status,
    started_at: state.startedAt,
    closed_at: state.closedAt,
    closeout_summary: state.closeoutSummary,
    facilitator_transcript: state.facilitatorTranscript,
    agreements: state.agreements,
    escalated_impediments: state.escalatedImpediments,
    follow_ups: state.followUps,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}

/** PostgreSQL: `daily_alignment_sessions`. */
export class DailyAlignmentSessionPrismaRepository implements DailyAlignmentSessionRepository {
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
  ): Promise<DailyAlignmentSessionState | null> {
    const row = await this.prisma.dailyAlignmentSession.findFirst({
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
  ): Promise<DailyAlignmentSessionState | null> {
    const row = await this.prisma.dailyAlignmentSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async insert(state: DailyAlignmentSessionState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId, state.sprintPublicId)
    if (!ids) throw new Error("daily_alignment_session_insert_context_not_found")
    await this.prisma.dailyAlignmentSession.create({
      data: stateToCreate(state, ids),
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<DailyAlignmentSessionRepository["updateCloseoutAndStatus"]>[3],
  ): Promise<DailyAlignmentSessionState | null> {
    const res = await this.prisma.dailyAlignmentSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
      data: {
        status: patch.status,
        closed_at: patch.closedAt,
        closeout_summary: patch.closeoutSummary,
        agreements: patch.agreements,
        escalated_impediments: patch.escalatedImpediments,
        follow_ups: patch.followUps,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async updateAlignmentModeIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    alignmentMode: DailyAlignmentSessionState["alignmentMode"],
    updatedAt: Date,
  ): Promise<DailyAlignmentSessionState | null> {
    const res = await this.prisma.dailyAlignmentSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: { alignment_mode: alignmentMode, updated_at: updatedAt },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async updateFacilitatorTranscriptIfClosed(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    facilitatorTranscript: string | null,
    updatedAt: Date,
  ): Promise<DailyAlignmentSessionState | null> {
    const res = await this.prisma.dailyAlignmentSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: [...CLOSED_STATUSES] },
      },
      data: { facilitator_transcript: facilitatorTranscript, updated_at: updatedAt },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<DailyAlignmentSessionState[]> {
    const rows = await this.prisma.dailyAlignmentSession.findMany({
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
  ): Promise<DailyAlignmentSessionState[]> {
    const rows = await this.prisma.dailyAlignmentSession.findMany({
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
