import type { PrismaClient } from "@prisma/client"
import { resolveGuidedReviewSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedReviewDemonstratedItemState } from "../../domain/guided-review-demonstrated-item.js"
import type { GuidedReviewDemonstratedItemRepository } from "../guided-review-demonstrated-item.repository.js"
import type { GuidedReviewDemonstratedItem } from "@prisma/client"

function rowToState(row: GuidedReviewDemonstratedItem): GuidedReviewDemonstratedItemState {
  return {
    demonstratedItemPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    workItemPublicId: row.work_item_public_id,
    demonstrationStatus: row.demonstration_status as GuidedReviewDemonstratedItemState["demonstrationStatus"],
    demonstratedByUserPublicIds: [...row.demonstrated_by_user_public_ids],
    demoNotes: row.demo_notes,
    stakeholderFeedbackSummary: row.stakeholder_feedback_summary,
    questionsRaised: [...row.questions_raised],
    followUpRequired: row.follow_up_required,
    backlogImpactSuggested: row.backlog_impact_suggested,
    priorityImpactSuggested: row.priority_impact_suggested,
    requiresFurtherValidation: row.requires_further_validation,
    reviewOutcome: row.review_outcome as GuidedReviewDemonstratedItemState["reviewOutcome"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_review_demonstrated_items`. */
export class GuidedReviewDemonstratedItemPrismaRepository implements GuidedReviewDemonstratedItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedReviewDemonstratedItemState | null> {
    const row = await this.prisma.guidedReviewDemonstratedItem.findFirst({
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
  ): Promise<GuidedReviewDemonstratedItemState[]> {
    const rows = await this.prisma.guidedReviewDemonstratedItem.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { work_item_public_id: "asc" },
    })
    return rows.map(rowToState)
  }

  async upsert(state: GuidedReviewDemonstratedItemState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    const sessionId = await resolveGuidedReviewSessionId(
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
      throw new Error("guided_review_demonstrated_item_upsert_context_not_found")
    }

    await this.prisma.guidedReviewDemonstratedItem.upsert({
      where: {
        workspace_id_project_id_session_id_work_item_id: {
          workspace_id: workspaceId,
          project_id: projectId,
          session_id: sessionId,
          work_item_id: workItemId,
        },
      },
      create: {
        public_id: state.demonstratedItemPublicId,
        session_id: sessionId,
        session_public_id: state.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        session_date: state.sessionDate,
        work_item_id: workItemId,
        work_item_public_id: state.workItemPublicId,
        demonstration_status: state.demonstrationStatus,
        demonstrated_by_user_public_ids: state.demonstratedByUserPublicIds,
        demo_notes: state.demoNotes,
        stakeholder_feedback_summary: state.stakeholderFeedbackSummary,
        questions_raised: state.questionsRaised,
        follow_up_required: state.followUpRequired,
        backlog_impact_suggested: state.backlogImpactSuggested,
        priority_impact_suggested: state.priorityImpactSuggested,
        requires_further_validation: state.requiresFurtherValidation,
        review_outcome: state.reviewOutcome,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        public_id: state.demonstratedItemPublicId,
        session_date: state.sessionDate,
        demonstration_status: state.demonstrationStatus,
        demonstrated_by_user_public_ids: state.demonstratedByUserPublicIds,
        demo_notes: state.demoNotes,
        stakeholder_feedback_summary: state.stakeholderFeedbackSummary,
        questions_raised: state.questionsRaised,
        follow_up_required: state.followUpRequired,
        backlog_impact_suggested: state.backlogImpactSuggested,
        priority_impact_suggested: state.priorityImpactSuggested,
        requires_further_validation: state.requiresFurtherValidation,
        review_outcome: state.reviewOutcome,
        updated_at: state.updatedAt,
      },
    })
  }

  async findLatestForWorkItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<{ item: GuidedReviewDemonstratedItemState; sessionPublicId: string; sessionDate: string } | null> {
    const row = await this.prisma.guidedReviewDemonstratedItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        work_item_public_id: workItemPublicId,
      },
      orderBy: [{ session_date: "desc" }, { updated_at: "desc" }],
    })
    if (!row) return null
    const item = rowToState(row)
    return { item, sessionPublicId: item.sessionPublicId, sessionDate: item.sessionDate }
  }
}
