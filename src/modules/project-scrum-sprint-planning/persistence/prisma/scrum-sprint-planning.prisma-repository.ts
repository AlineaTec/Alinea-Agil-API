import type { PrismaClient } from "@prisma/client"
import type { SprintBoardColumn } from "../../../project-scrum-sprint-board/domain/sprint-board-column.js"
import {
  resolveProjectId,
  resolveSprintId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ProjectScrumSprintAssignmentState } from "../../domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintState } from "../../domain/scrum-sprint.js"
import type { ScrumSprintStatus } from "../../domain/sprint-status.js"
import { docToProjectScrumSprintAssignmentState } from "../mappers/project-scrum-sprint-assignment.mapper.js"
import type { ProjectScrumSprintAssignmentDocProps } from "../schemas/project-scrum-sprint-assignment.schema.js"
import type { ScrumSprintPlanningRepository } from "../scrum-sprint-planning.repository.js"
import {
  sprintRowToState,
  sprintStateToCreate,
  sprintStateToUpdateData,
} from "./scrum-sprint.prisma-mapper.js"

function assignmentRowToDoc(row: {
  sprint_public_id: string
  work_item_public_id: string
  workspace_public_id: string
  project_public_id: string
  sprint_sort_order: number
  committed_at: Date
  committed_by_user_public_id: string
  board_column: string | null
}): ProjectScrumSprintAssignmentDocProps {
  return {
    sprintPublicId: row.sprint_public_id,
    backlogItemPublicId: row.work_item_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sprintSortOrder: row.sprint_sort_order,
    committedAt: row.committed_at,
    committedByUserPublicId: row.committed_by_user_public_id,
    boardColumn: row.board_column,
  }
}

/** PostgreSQL: `sprints` + `sprint_assignments`. en runtime. */
export class ScrumSprintPlanningPrismaRepository implements ScrumSprintPlanningRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveProjectIds(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<{ workspaceId: string; projectId: string } | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    if (!workspaceId || !projectId) return null
    return { workspaceId, projectId }
  }

  async insertSprint(state: ScrumSprintState): Promise<void> {
    const ids = await this.resolveProjectIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("sprint_insert_context_not_found")
    await this.prisma.sprint.create({ data: sprintStateToCreate(state, ids) })
  }

  async replaceSprint(state: ScrumSprintState): Promise<void> {
    const ids = await this.resolveProjectIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("Sprint not found for replace.")
    const res = await this.prisma.sprint.updateMany({
      where: {
        workspace_id: ids.workspaceId,
        project_id: ids.projectId,
        public_id: state.sprintPublicId,
      },
      data: sprintStateToUpdateData(state),
    })
    if (res.count === 0) throw new Error("Sprint not found for replace.")
  }

  async findSprintByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ScrumSprintState | null> {
    const row = await this.prisma.sprint.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sprintPublicId,
      },
    })
    return row ? sprintRowToState(row) : null
  }

  async listSprintsByProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ScrumSprintState[]> {
    const rows = await this.prisma.sprint.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: { created_at: "desc" },
    })
    return rows.map(sprintRowToState)
  }

  async countSprintsByProjectAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    status: ScrumSprintStatus,
  ): Promise<number> {
    return this.prisma.sprint.count({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId, status },
    })
  }

  async countSprintsByProjectAndStatusExcludingSprint(
    workspacePublicId: string,
    projectPublicId: string,
    status: ScrumSprintStatus,
    excludeSprintPublicId: string,
  ): Promise<number> {
    return this.prisma.sprint.count({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        status,
        public_id: { not: excludeSprintPublicId },
      },
    })
  }

  async insertMembership(state: ProjectScrumSprintAssignmentState): Promise<void> {
    const ids = await this.resolveProjectIds(state.workspacePublicId, state.projectPublicId)
    const sprintId = await resolveSprintId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
      state.sprintPublicId,
    )
    const workItemId = await resolveWorkItemId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
      state.backlogItemPublicId,
    )
    if (!ids || !sprintId || !workItemId) throw new Error("sprint_assignment_insert_context_not_found")
    await this.prisma.sprintAssignment.create({
      data: {
        workspace_id: ids.workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: ids.projectId,
        project_public_id: state.projectPublicId,
        sprint_id: sprintId,
        sprint_public_id: state.sprintPublicId,
        work_item_id: workItemId,
        work_item_public_id: state.backlogItemPublicId,
        sprint_sort_order: state.sprintSortOrder,
        committed_at: state.committedAt,
        committed_by_user_public_id: state.committedByUserPublicId,
        board_column: state.boardColumn ?? null,
      },
    })
  }

  async deleteMembership(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
  ): Promise<void> {
    await this.prisma.sprintAssignment.deleteMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
        work_item_public_id: backlogItemPublicId,
      },
    })
  }

  async listMembershipsBySprintOrdered(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState[]> {
    const rows = await this.prisma.sprintAssignment.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
      },
      orderBy: [{ sprint_sort_order: "asc" }, { committed_at: "asc" }],
    })
    return rows.map((r) => docToProjectScrumSprintAssignmentState(assignmentRowToDoc(r)))
  }

  async findMembership(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState | null> {
    const row = await this.prisma.sprintAssignment.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
        work_item_public_id: backlogItemPublicId,
      },
    })
    return row ? docToProjectScrumSprintAssignmentState(assignmentRowToDoc(row)) : null
  }

  async maxSprintSortOrder(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<number> {
    const row = await this.prisma.sprintAssignment.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
      },
      orderBy: { sprint_sort_order: "desc" },
      select: { sprint_sort_order: true },
    })
    return row?.sprint_sort_order ?? 0
  }

  async listMembershipRowsForBacklogItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ProjectScrumSprintAssignmentState[]> {
    const rows = await this.prisma.sprintAssignment.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        work_item_public_id: backlogItemPublicId,
      },
    })
    return rows.map((r) => docToProjectScrumSprintAssignmentState(assignmentRowToDoc(r)))
  }

  async updateMembershipBoardColumn(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    backlogItemPublicId: string,
    boardColumn: SprintBoardColumn,
  ): Promise<void> {
    const res = await this.prisma.sprintAssignment.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        sprint_public_id: sprintPublicId,
        work_item_public_id: backlogItemPublicId,
      },
      data: { board_column: boardColumn },
    })
    if (res.count === 0) throw new Error("membership_not_found_for_board_column_update")
  }

  async bulkSetMembershipSprintSortOrders(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    updates: Array<{ backlogItemPublicId: string; sprintSortOrder: number }>,
  ): Promise<void> {
    if (updates.length === 0) return
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.sprintAssignment.updateMany({
          where: {
            workspace_public_id: workspacePublicId,
            project_public_id: projectPublicId,
            sprint_public_id: sprintPublicId,
            work_item_public_id: u.backlogItemPublicId,
          },
          data: { sprint_sort_order: u.sprintSortOrder },
        }),
      ),
    )
  }
}
