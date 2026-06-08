import type { PrismaClient } from "@prisma/client"
import {
  resolveGuidedPlanningSessionId,
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedSprintPlanningBaselineState } from "../../domain/guided-sprint-planning-baseline.js"
import type { GuidedSprintPlanningBaselineRepository } from "../guided-sprint-planning-baseline.repository.js"
import type { GuidedSprintPlanningBaseline } from "@prisma/client"

function rowToState(row: GuidedSprintPlanningBaseline): GuidedSprintPlanningBaselineState {
  return {
    baselinePublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sprintPublicId: row.sprint_public_id,
    sprintGoal: row.sprint_goal,
    committedWorkItemPublicIds: [...row.committed_work_item_public_ids],
    capacityTotal: row.capacity_total,
    capacityUnit: row.capacity_unit as GuidedSprintPlanningBaselineState["capacityUnit"],
    bufferReserved: row.buffer_reserved,
    knownRisks: [...row.known_risks],
    knownDependencies: [...row.known_dependencies],
    baselineWarnings: [...row.baseline_warnings],
    createdAt: row.created_at,
    createdByUserPublicId: row.created_by_user_public_id,
  }
}

/** PostgreSQL: `guided_sprint_planning_baselines`. */
export class GuidedSprintPlanningBaselinePrismaRepository implements GuidedSprintPlanningBaselineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: GuidedSprintPlanningBaselineState): Promise<void> {
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
    const sprintId = state.sprintPublicId
      ? await resolveSprintId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.sprintPublicId,
        )
      : null
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("guided_planning_baseline_insert_context_not_found")
    }

    await this.prisma.guidedSprintPlanningBaseline.create({
      data: {
        public_id: state.baselinePublicId,
        session_id: sessionId,
        session_public_id: state.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        sprint_id: sprintId,
        sprint_public_id: state.sprintPublicId,
        sprint_goal: state.sprintGoal,
        committed_work_item_public_ids: state.committedWorkItemPublicIds,
        capacity_total: state.capacityTotal,
        capacity_unit: state.capacityUnit,
        buffer_reserved: state.bufferReserved,
        known_risks: state.knownRisks,
        known_dependencies: state.knownDependencies,
        baseline_warnings: state.baselineWarnings,
        created_at: state.createdAt,
        created_by_user_public_id: state.createdByUserPublicId,
      },
    })
  }

  async findBySessionPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedSprintPlanningBaselineState | null> {
    const row = await this.prisma.guidedSprintPlanningBaseline.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async findLatestBySprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<GuidedSprintPlanningBaselineState | null> {
    const row = await this.prisma.guidedSprintPlanningBaseline.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
      },
      orderBy: { created_at: "desc" },
    })
    return row ? rowToState(row) : null
  }
}
