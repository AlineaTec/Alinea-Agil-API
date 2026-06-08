import { Prisma, type PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  GuidedReviewAdditiveNote,
  GuidedReviewSessionState,
  GuidedReviewTranscriptAfterClose,
  SprintGoalAssessment,
} from "../../domain/guided-review-session.js"
import type { GuidedReviewSessionRepository } from "../guided-review-session.repository.js"
import type { GuidedReviewSession } from "@prisma/client"

type AdditiveNoteJson = {
  noteText: string
  createdByUserPublicId: string
  createdAt: string | Date
}

function parseAdditiveNotes(raw: unknown): GuidedReviewAdditiveNote[] {
  if (!Array.isArray(raw)) return []
  return raw.map((n) => {
    const note = n as AdditiveNoteJson
    return {
      noteText: note.noteText,
      createdByUserPublicId: note.createdByUserPublicId,
      createdAt: note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt),
    }
  })
}

function parseTranscript(raw: unknown): GuidedReviewTranscriptAfterClose | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as { text: string; updatedAt: string | Date; updatedByUserPublicId: string }
  return {
    text: t.text,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt : new Date(t.updatedAt),
    updatedByUserPublicId: t.updatedByUserPublicId,
  }
}

function rowToState(row: GuidedReviewSession): GuidedReviewSessionState {
  return {
    sessionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    sessionSlot: row.session_slot,
    sprintPublicId: row.sprint_public_id,
    operationalApproach: row.operational_approach as GuidedReviewSessionState["operationalApproach"],
    operationalTimeZone: row.operational_time_zone,
    reviewMode: row.review_mode as GuidedReviewSessionState["reviewMode"],
    facilitatorUserPublicId: row.facilitator_user_public_id,
    productOwnerUserPublicId: row.product_owner_user_public_id,
    status: row.status as GuidedReviewSessionState["status"],
    reviewGoalSummary: row.review_goal_summary,
    closeSummary: row.close_summary,
    agreements: [...row.agreements],
    followUps: [...row.follow_ups],
    stakeholderSummary: row.stakeholder_summary,
    openQuestionsRemaining: [...row.open_questions_remaining],
    methodologicalNotes: row.methodological_notes,
    incrementAssessment: row.increment_assessment,
    sprintGoalAssessment: row.sprint_goal_assessment as SprintGoalAssessment | null,
    sprintGoalAssessmentExplanation: row.sprint_goal_assessment_explanation,
    transcriptAfterClose: parseTranscript(row.transcript_after_close),
    additiveNotesAfterClose: parseAdditiveNotes(row.additive_notes_after_close),
    demonstratedItemCount: row.demonstrated_item_count,
    feedbackCount: row.feedback_count,
    backlogImpactCount: row.backlog_impact_count,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stateToCreate(
  state: GuidedReviewSessionState,
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
    review_mode: state.reviewMode,
    facilitator_user_public_id: state.facilitatorUserPublicId,
    product_owner_user_public_id: state.productOwnerUserPublicId,
    status: state.status,
    review_goal_summary: state.reviewGoalSummary,
    close_summary: state.closeSummary,
    agreements: state.agreements,
    follow_ups: state.followUps,
    stakeholder_summary: state.stakeholderSummary,
    open_questions_remaining: state.openQuestionsRemaining,
    methodological_notes: state.methodologicalNotes,
    increment_assessment: state.incrementAssessment,
    sprint_goal_assessment: state.sprintGoalAssessment,
    sprint_goal_assessment_explanation: state.sprintGoalAssessmentExplanation,
    transcript_after_close: state.transcriptAfterClose
      ? (state.transcriptAfterClose as Prisma.InputJsonValue)
      : undefined,
    additive_notes_after_close: state.additiveNotesAfterClose as Prisma.InputJsonValue,
    demonstrated_item_count: state.demonstratedItemCount,
    feedback_count: state.feedbackCount,
    backlog_impact_count: state.backlogImpactCount,
    started_at: state.startedAt,
    closed_at: state.closedAt,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}

/** PostgreSQL: `guided_review_sessions`. */
export class GuidedReviewSessionPrismaRepository implements GuidedReviewSessionRepository {
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
  ): Promise<GuidedReviewSessionState | null> {
    const row = await this.prisma.guidedReviewSession.findFirst({
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
  ): Promise<GuidedReviewSessionState | null> {
    const row = await this.prisma.guidedReviewSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async insert(state: GuidedReviewSessionState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId, state.sprintPublicId)
    if (!ids) throw new Error("guided_review_session_insert_context_not_found")
    await this.prisma.guidedReviewSession.create({
      data: stateToCreate(state, ids),
    })
  }

  async updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedReviewSessionRepository["updateHeaderIfOpen"]>[3],
  ): Promise<GuidedReviewSessionState | null> {
    const sprintId = patch.sprintPublicId
      ? await resolveSprintId(this.prisma, workspacePublicId, projectPublicId, patch.sprintPublicId)
      : null
    if (patch.sprintPublicId && !sprintId) return null

    const res = await this.prisma.guidedReviewSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: "open",
      },
      data: {
        review_goal_summary: patch.reviewGoalSummary,
        review_mode: patch.reviewMode,
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
    counts: Parameters<GuidedReviewSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    await this.prisma.guidedReviewSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
      data: {
        demonstrated_item_count: counts.demonstratedItemCount,
        feedback_count: counts.feedbackCount,
        backlog_impact_count: counts.backlogImpactCount,
        updated_at: counts.updatedAt,
      },
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedReviewSessionRepository["updateCloseoutAndStatus"]>[3],
  ): Promise<GuidedReviewSessionState | null> {
    const res = await this.prisma.guidedReviewSession.updateMany({
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
        stakeholder_summary: patch.stakeholderSummary,
        open_questions_remaining: patch.openQuestionsRemaining,
        methodological_notes: patch.methodologicalNotes,
        increment_assessment: patch.incrementAssessment,
        sprint_goal_assessment: patch.sprintGoalAssessment,
        sprint_goal_assessment_explanation: patch.sprintGoalAssessmentExplanation,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        demonstrated_item_count: patch.demonstratedItemCount,
        feedback_count: patch.feedbackCount,
        backlog_impact_count: patch.backlogImpactCount,
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
    note: GuidedReviewAdditiveNote,
    updatedAt: Date,
  ): Promise<GuidedReviewSessionState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!existing || existing.status === "open") return null

    const res = await this.prisma.guidedReviewSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { not: "open" },
      },
      data: {
        additive_notes_after_close: [
          ...existing.additiveNotesAfterClose,
          note,
        ] as Prisma.InputJsonValue,
        updated_at: updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedReviewTranscriptAfterClose | null,
    updatedAt: Date,
  ): Promise<GuidedReviewSessionState | null> {
    const res = await this.prisma.guidedReviewSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { not: "open" },
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

  async listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedReviewSessionState[]> {
    const rows = await this.prisma.guidedReviewSession.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: [{ session_date: "desc" }, { session_slot: "desc" }, { updated_at: "desc" }],
      take: limit,
    })
    return rows.map(rowToState)
  }

  async listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedReviewSessionState[]> {
    const rows = await this.prisma.guidedReviewSession.findMany({
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
