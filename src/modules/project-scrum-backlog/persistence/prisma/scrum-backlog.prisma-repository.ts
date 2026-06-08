import type { Prisma, PrismaClient } from "@prisma/client"
import type { WorkItemAssignmentHistoryEvent } from "../../../work-item-assignment/domain/work-item-assignment-history-event.js"
import {
  resolveKanbanColumnId,
  resolveProjectId,
  resolveSprintId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ScrumBacklogItemState } from "../../domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../scrum-backlog.repository.js"
import { stateToWorkItemCreate, workItemRowToState } from "./work-item.prisma-mapper.js"

type WorkItemWithParent = {
  parent_item: { public_id: string } | null
} & Parameters<typeof workItemRowToState>[0]

async function loadState(row: WorkItemWithParent): Promise<ScrumBacklogItemState> {
  return workItemRowToState(row, row.parent_item?.public_id ?? null)
}

/** Tabla unificada `work_items` (nombre legacy). */
export class ScrumBacklogPrismaRepository implements ScrumBacklogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveIds(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<{ workspaceId: string; projectId: string } | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    if (!workspaceId || !projectId) return null
    return { workspaceId, projectId }
  }

  private async resolveWorkItemFkIds(
    workspacePublicId: string,
    projectPublicId: string,
    projectId: string,
    state: Pick<ScrumBacklogItemState, "kanbanColumnPublicId" | "completedInSprintPublicId">,
  ): Promise<{ kanbanColumnId: string | null; completedInSprintId: string | null }> {
    const kanbanColumnId = await resolveKanbanColumnId(
      this.prisma,
      projectId,
      state.kanbanColumnPublicId,
    )
    if (state.kanbanColumnPublicId && !kanbanColumnId) {
      throw new Error("work_item_kanban_column_not_found")
    }
    const completedInSprintId = state.completedInSprintPublicId
      ? await resolveSprintId(
          this.prisma,
          workspacePublicId,
          projectPublicId,
          state.completedInSprintPublicId,
        )
      : null
    if (state.completedInSprintPublicId && !completedInSprintId) {
      throw new Error("work_item_completed_sprint_not_found")
    }
    return { kanbanColumnId, completedInSprintId }
  }

  async insert(state: ScrumBacklogItemState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("work_item_insert_context_not_found")
    const parentItemId = state.parentItemPublicId
      ? await resolveWorkItemId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.parentItemPublicId,
        )
      : null
    const fkIds = await this.resolveWorkItemFkIds(
      state.workspacePublicId,
      state.projectPublicId,
      ids.projectId,
      state,
    )
    await this.prisma.workItem.create({
      data: stateToWorkItemCreate(state, { ...ids, parentItemId, ...fkIds }),
    })
  }

  async replace(state: ScrumBacklogItemState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("scrum_backlog_item_not_found")
    const parentItemId = state.parentItemPublicId
      ? await resolveWorkItemId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.parentItemPublicId,
        )
      : null
    const fkIds = await this.resolveWorkItemFkIds(
      state.workspacePublicId,
      state.projectPublicId,
      ids.projectId,
      state,
    )
    const res = await this.prisma.workItem.updateMany({
      where: {
        workspace_id: ids.workspaceId,
        project_id: ids.projectId,
        public_id: state.backlogItemPublicId,
      },
      data: {
        title: state.title,
        description: state.description,
        status: state.status,
        sort_order: state.sortOrder,
        parent_item_id: parentItemId,
        updated_at: state.updatedAt,
        completed_in_sprint_public_id: state.completedInSprintPublicId,
        completed_in_sprint_id: fkIds.completedInSprintId,
        story_points: state.storyPoints,
        priority_level: state.priorityLevel,
        acceptance_criteria: state.acceptanceCriteria,
        kanban_column_public_id: state.kanbanColumnPublicId,
        kanban_column_id: fkIds.kanbanColumnId,
      },
    })
    if (res.count === 0) throw new Error("scrum_backlog_item_not_found")
  }

  async findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState | null> {
    const row = await this.prisma.workItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: backlogItemPublicId,
      },
      include: { parent_item: { select: { public_id: true } } },
    })
    return row ? loadState(row as WorkItemWithParent) : null
  }

  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ScrumBacklogItemState[]> {
    const rows = await this.prisma.workItem.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: { parent_item: { select: { public_id: true } } },
    })
    return Promise.all(rows.map((r) => loadState(r as WorkItemWithParent)))
  }

  async maxSortOrderAmongSiblings(
    workspacePublicId: string,
    projectPublicId: string,
    parentItemPublicId: string | null,
  ): Promise<number> {
    const parentItemId = parentItemPublicId
      ? await resolveWorkItemId(this.prisma, workspacePublicId, projectPublicId, parentItemPublicId)
      : null
    const row = await this.prisma.workItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        parent_item_id: parentItemId,
      },
      orderBy: { sort_order: "desc" },
      select: { sort_order: true },
    })
    return row?.sort_order ?? -1
  }

  async bulkSetSortOrders(
    workspacePublicId: string,
    projectPublicId: string,
    updates: Array<{ backlogItemPublicId: string; sortOrder: number; updatedAt: Date }>,
  ): Promise<void> {
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.workItem.updateMany({
          where: {
            workspace_public_id: workspacePublicId,
            project_public_id: projectPublicId,
            public_id: u.backlogItemPublicId,
          },
          data: { sort_order: u.sortOrder, updated_at: u.updatedAt },
        }),
      ),
    )
  }

  async pushAssignmentEventAndSetAssignee(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    update: {
      assignedUserPublicId: string | null
      assignmentUpdatedAt: Date
      assignmentUpdatedByUserPublicId: string | null
      event: WorkItemAssignmentHistoryEvent
    },
  ): Promise<ScrumBacklogItemState | null> {
    const existing = await this.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!existing) return null
    const history = [...existing.assignmentHistory, update.event]
    const row = await this.prisma.workItem.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: backlogItemPublicId,
      },
      data: {
        assigned_user_public_id: update.assignedUserPublicId,
        assignment_updated_at: update.assignmentUpdatedAt,
        assignment_updated_by_user_public_id: update.assignmentUpdatedByUserPublicId,
        assignment_history: history,
        updated_at: update.assignmentUpdatedAt,
      },
    })
    if (row.count === 0) return null
    return this.findByProjectAndItemId(workspacePublicId, projectPublicId, backlogItemPublicId)
  }

  async adjustCommentsCount(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    delta: number,
  ): Promise<boolean> {
    if (delta < 0) {
      const item = await this.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      if (!item || item.commentsCount + delta < 0) return false
    }
    const res = await this.prisma.workItem.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: backlogItemPublicId,
      },
      data: { comments_count: { increment: delta } },
    })
    return res.count > 0
  }

  async listKanbanBacklogItems(
    workspacePublicId: string,
    projectPublicId: string,
    options?: { search?: string },
  ): Promise<ScrumBacklogItemState[]> {
    const where: Prisma.WorkItemWhereInput = {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      kanban_column_public_id: null,
      parent_item_id: null,
    }
    if (options?.search?.trim()) {
      const q = options.search.trim()
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ]
    }
    const rows = await this.prisma.workItem.findMany({
      where,
      orderBy: { sort_order: "asc" },
      include: { parent_item: { select: { public_id: true } } },
    })
    return Promise.all(rows.map((r) => loadState(r as WorkItemWithParent)))
  }

  async countItemsInKanbanColumn(
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
  ): Promise<number> {
    return this.prisma.workItem.count({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        kanban_column_public_id: columnPublicId,
      },
    })
  }

  async maxSortOrderKanbanBacklog(workspacePublicId: string, projectPublicId: string): Promise<number> {
    const row = await this.prisma.workItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        kanban_column_public_id: null,
        parent_item_id: null,
      },
      orderBy: { sort_order: "desc" },
      select: { sort_order: true },
    })
    return row?.sort_order ?? -1
  }

  async minSortOrderKanbanBacklog(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<number | null> {
    const row = await this.prisma.workItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        kanban_column_public_id: null,
        parent_item_id: null,
      },
      orderBy: { sort_order: "asc" },
      select: { sort_order: true },
    })
    return row?.sort_order ?? null
  }

  async listKanbanBoardItems(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ScrumBacklogItemState[]> {
    const rows = await this.prisma.workItem.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        kanban_column_public_id: { not: null },
      },
      orderBy: { sort_order: "asc" },
      include: { parent_item: { select: { public_id: true } } },
    })
    return Promise.all(rows.map((r) => loadState(r as WorkItemWithParent)))
  }
}
