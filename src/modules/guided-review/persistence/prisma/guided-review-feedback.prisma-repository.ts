import type { PrismaClient } from "@prisma/client"
import { resolveGuidedReviewSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedReviewFeedbackState } from "../../domain/guided-review-feedback.js"
import type { GuidedReviewFeedbackRepository } from "../guided-review-feedback.repository.js"
import type { GuidedReviewFeedbackEntry } from "@prisma/client"

function rowToState(row: GuidedReviewFeedbackEntry): GuidedReviewFeedbackState {
  return {
    feedbackEntryPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sourceType: row.source_type as GuidedReviewFeedbackState["sourceType"],
    stakeholderDisplayName: row.stakeholder_display_name,
    feedbackText: row.body,
    feedbackCategory: row.feedback_category as GuidedReviewFeedbackState["feedbackCategory"],
    affectsWorkItemPublicIds: [...row.affects_work_item_public_ids],
    isGeneralFeedback: row.is_general_feedback,
    suggestedBacklogAction: row.suggested_backlog_action,
    suggestedPriorityImpact: row.suggested_priority_impact,
    marksFollowUp: row.follow_up_required,
    marksBacklogImpact: row.backlog_impact_suggested,
    marksPriorityImpact: row.priority_impact_suggested,
    createdByUserPublicId: row.created_by_user_public_id,
    createdAt: row.created_at,
  }
}

/** PostgreSQL: `guided_review_feedback_entries`. */
export class GuidedReviewFeedbackPrismaRepository implements GuidedReviewFeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: GuidedReviewFeedbackState): Promise<void> {
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
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("guided_review_feedback_insert_context_not_found")
    }

    await this.prisma.guidedReviewFeedbackEntry.create({
      data: {
        public_id: state.feedbackEntryPublicId,
        session_id: sessionId,
        session_public_id: state.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        source_type: state.sourceType,
        stakeholder_display_name: state.stakeholderDisplayName,
        body: state.feedbackText,
        feedback_category: state.feedbackCategory,
        affects_work_item_public_ids: state.affectsWorkItemPublicIds,
        is_general_feedback: state.isGeneralFeedback,
        suggested_backlog_action: state.suggestedBacklogAction,
        suggested_priority_impact: state.suggestedPriorityImpact,
        follow_up_required: state.marksFollowUp,
        backlog_impact_suggested: state.marksBacklogImpact,
        priority_impact_suggested: state.marksPriorityImpact,
        created_by_user_public_id: state.createdByUserPublicId,
        created_at: state.createdAt,
      },
    })
  }

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedReviewFeedbackState[]> {
    const rows = await this.prisma.guidedReviewFeedbackEntry.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { created_at: "asc" },
    })
    return rows.map(rowToState)
  }
}
