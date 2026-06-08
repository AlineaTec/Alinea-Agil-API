import type { PrismaClient } from "@prisma/client"
import {
  resolveGuidedPlanningSessionId,
  resolveProjectId,
  resolveSprintId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedSprintPlanningCandidateItemState } from "../../domain/guided-sprint-planning-candidate-item.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "../guided-sprint-planning-candidate-item.repository.js"
import type { GuidedSprintPlanningCandidateItem } from "@prisma/client"

function rowToState(row: GuidedSprintPlanningCandidateItem): GuidedSprintPlanningCandidateItemState {
  return {
    candidateItemPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sprintPublicId: row.sprint_public_id,
    workItemPublicId: row.work_item_public_id,
    isReadyForPlanning: row.is_ready_for_planning,
    isCommitted: row.is_committed,
    isExcluded: row.is_excluded,
    excludedReason: row.excluded_reason as GuidedSprintPlanningCandidateItemState["excludedReason"],
    excludedReasonNotes: row.excluded_reason_notes,
    riskNotes: row.risk_notes,
    dependencyNotes: row.dependency_notes,
    capacityConcern: row.capacity_concern as GuidedSprintPlanningCandidateItemState["capacityConcern"],
    planningDecisionNotes: row.planning_decision_notes,
    commitmentDecisionByUserPublicIds: [...row.commitment_decision_by_user_public_ids],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_sprint_planning_candidate_items`. */
export class GuidedSprintPlanningCandidateItemPrismaRepository
  implements GuidedSprintPlanningCandidateItemRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<GuidedSprintPlanningCandidateItemState | null> {
    const row = await this.prisma.guidedSprintPlanningCandidateItem.findFirst({
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
  ): Promise<GuidedSprintPlanningCandidateItemState[]> {
    const rows = await this.prisma.guidedSprintPlanningCandidateItem.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { updated_at: "asc" },
    })
    return rows.map(rowToState)
  }

  async upsert(state: GuidedSprintPlanningCandidateItemState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    const sessionId = await resolveGuidedPlanningSessionId(
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
    const sprintId = state.sprintPublicId
      ? await resolveSprintId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.sprintPublicId,
        )
      : null
    if (!workspaceId || !projectId || !sessionId || !workItemId) {
      throw new Error("guided_planning_candidate_upsert_context_not_found")
    }

    await this.prisma.guidedSprintPlanningCandidateItem.upsert({
      where: {
        workspace_id_project_id_session_id_work_item_id: {
          workspace_id: workspaceId,
          project_id: projectId,
          session_id: sessionId,
          work_item_id: workItemId,
        },
      },
      create: {
        public_id: state.candidateItemPublicId,
        session_id: sessionId,
        session_public_id: state.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        sprint_id: sprintId,
        sprint_public_id: state.sprintPublicId,
        work_item_id: workItemId,
        work_item_public_id: state.workItemPublicId,
        is_ready_for_planning: state.isReadyForPlanning,
        is_committed: state.isCommitted,
        is_excluded: state.isExcluded,
        excluded_reason: state.excludedReason,
        excluded_reason_notes: state.excludedReasonNotes,
        risk_notes: state.riskNotes,
        dependency_notes: state.dependencyNotes,
        capacity_concern: state.capacityConcern,
        planning_decision_notes: state.planningDecisionNotes,
        commitment_decision_by_user_public_ids: state.commitmentDecisionByUserPublicIds,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        public_id: state.candidateItemPublicId,
        sprint_id: sprintId,
        sprint_public_id: state.sprintPublicId,
        is_ready_for_planning: state.isReadyForPlanning,
        is_committed: state.isCommitted,
        is_excluded: state.isExcluded,
        excluded_reason: state.excludedReason,
        excluded_reason_notes: state.excludedReasonNotes,
        risk_notes: state.riskNotes,
        dependency_notes: state.dependencyNotes,
        capacity_concern: state.capacityConcern,
        planning_decision_notes: state.planningDecisionNotes,
        commitment_decision_by_user_public_ids: state.commitmentDecisionByUserPublicIds,
        updated_at: state.updatedAt,
      },
    })
  }

  async deleteBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ): Promise<boolean> {
    const res = await this.prisma.guidedSprintPlanningCandidateItem.deleteMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        work_item_public_id: workItemPublicId,
      },
    })
    return res.count > 0
  }
}
