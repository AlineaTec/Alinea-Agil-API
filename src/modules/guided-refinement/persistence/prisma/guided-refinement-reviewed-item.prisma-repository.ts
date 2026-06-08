import type { PrismaClient } from "@prisma/client"
import { resolveGuidedRefinementSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedRefinementReviewedItemState } from "../../domain/guided-refinement-reviewed-item.js"
import type { GuidedRefinementReviewedItemRepository } from "../guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementReviewedItem } from "@prisma/client"

function rowToState(row: GuidedRefinementReviewedItem): GuidedRefinementReviewedItemState {
  return {
    reviewedItemPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    workItemPublicId: row.work_item_public_id,
    reviewStatus: row.review_status as GuidedRefinementReviewedItemState["reviewStatus"],
    readyForPlanning: row.ready_for_planning,
    readyWithObservations: row.ready_with_observations,
    observations: row.observations,
    businessClarifications: row.business_clarifications,
    technicalQuestions: row.technical_questions,
    dependenciesText: row.dependencies_text,
    risksText: row.risks_text,
    estimationStatus: row.estimation_status as GuidedRefinementReviewedItemState["estimationStatus"],
    sizeConcern: row.size_concern as GuidedRefinementReviewedItemState["sizeConcern"],
    notReadyReasons: [...row.not_ready_reasons],
    followUpRequired: row.follow_up_required,
    reviewedByUserPublicIds: [...row.reviewed_by_user_public_ids],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function compareReviewedItemRecency(
  a: { sessionDate: string; updatedAt: Date },
  b: { sessionDate: string; updatedAt: Date },
): number {
  if (a.sessionDate !== b.sessionDate) {
    return a.sessionDate > b.sessionDate ? 1 : -1
  }
  return a.updatedAt.getTime() - b.updatedAt.getTime()
}

/** PostgreSQL: `guided_refinement_reviewed_items`. */
export class GuidedRefinementReviewedItemPrismaRepository implements GuidedRefinementReviewedItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState | null> {
    const row = await this.prisma.guidedRefinementReviewedItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        work_item_public_id: workItemPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState[]> {
    const rows = await this.prisma.guidedRefinementReviewedItem.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { updated_at: "asc" },
    })
    return rows.map(rowToState)
  }

  async upsert(state: GuidedRefinementReviewedItemState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    const sessionId = await resolveGuidedRefinementSessionId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
      state.sessionPublicId,
    )
    const workItemId = await resolveWorkItemId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
      state.workItemPublicId,
    )
    if (!workspaceId || !projectId || !sessionId || !workItemId) {
      throw new Error("guided_refinement_reviewed_item_upsert_context_not_found")
    }

    await this.prisma.guidedRefinementReviewedItem.upsert({
      where: {
        workspace_id_project_id_session_id_work_item_id: {
          workspace_id: workspaceId,
          project_id: projectId,
          session_id: sessionId,
          work_item_id: workItemId,
        },
      },
      create: {
        public_id: state.reviewedItemPublicId,
        session_id: sessionId,
        session_public_id: state.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        session_date: state.sessionDate,
        work_item_id: workItemId,
        work_item_public_id: state.workItemPublicId,
        review_status: state.reviewStatus,
        ready_for_planning: state.readyForPlanning,
        ready_with_observations: state.readyWithObservations,
        observations: state.observations,
        business_clarifications: state.businessClarifications,
        technical_questions: state.technicalQuestions,
        dependencies_text: state.dependenciesText,
        risks_text: state.risksText,
        estimation_status: state.estimationStatus,
        size_concern: state.sizeConcern,
        not_ready_reasons: state.notReadyReasons,
        follow_up_required: state.followUpRequired,
        reviewed_by_user_public_ids: state.reviewedByUserPublicIds,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        public_id: state.reviewedItemPublicId,
        session_date: state.sessionDate,
        review_status: state.reviewStatus,
        ready_for_planning: state.readyForPlanning,
        ready_with_observations: state.readyWithObservations,
        observations: state.observations,
        business_clarifications: state.businessClarifications,
        technical_questions: state.technicalQuestions,
        dependencies_text: state.dependenciesText,
        risks_text: state.risksText,
        estimation_status: state.estimationStatus,
        size_concern: state.sizeConcern,
        not_ready_reasons: state.notReadyReasons,
        follow_up_required: state.followUpRequired,
        reviewed_by_user_public_ids: state.reviewedByUserPublicIds,
        updated_at: state.updatedAt,
      },
    })
  }

  async findLatestForWorkItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedRefinementReviewedItemState | null> {
    const row = await this.prisma.guidedRefinementReviewedItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        work_item_public_id: workItemPublicId,
      },
      orderBy: [{ session_date: "desc" }, { updated_at: "desc" }],
    })
    return row ? rowToState(row) : null
  }

  async countDistinctWorkItemsLatestReadyForPlanning(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<number> {
    const rows = await this.prisma.guidedRefinementReviewedItem.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      select: {
        work_item_public_id: true,
        review_status: true,
        ready_for_planning: true,
        session_date: true,
        updated_at: true,
      },
    })

    const latestByWorkItem = new Map<
      string,
      { reviewStatus: string; readyForPlanning: boolean; sessionDate: string; updatedAt: Date }
    >()

    for (const row of rows) {
      const candidate = {
        reviewStatus: row.review_status,
        readyForPlanning: row.ready_for_planning,
        sessionDate: row.session_date,
        updatedAt: row.updated_at,
      }
      const prev = latestByWorkItem.get(row.work_item_public_id)
      if (!prev || compareReviewedItemRecency(candidate, prev) > 0) {
        latestByWorkItem.set(row.work_item_public_id, candidate)
      }
    }

    let count = 0
    for (const row of latestByWorkItem.values()) {
      if (row.reviewStatus === "reviewed" && row.readyForPlanning) {
        count++
      }
    }
    return count
  }
}
