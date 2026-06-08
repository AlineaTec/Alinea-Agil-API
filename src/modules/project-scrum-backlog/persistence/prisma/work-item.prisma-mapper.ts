import type { WorkItem } from "@prisma/client"
import type { Prisma } from "@prisma/client"
import type { ScrumBacklogItemState } from "../../domain/scrum-backlog-item.js"
import { docToScrumBacklogItemState } from "../mappers/scrum-backlog-item.mapper.js"
import type { ScrumBacklogItemDocProps } from "../schemas/scrum-backlog-item.schema.js"

export function workItemRowToDocProps(row: WorkItem): ScrumBacklogItemDocProps {
  return {
    backlogItemPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    itemType: row.item_type,
    title: row.title,
    description: row.description,
    status: row.status,
    sortOrder: row.sort_order,
    parentItemPublicId: null, // resolved below when mapping state
    createdByUserPublicId: row.created_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedInSprintPublicId: row.completed_in_sprint_public_id,
    assignedUserPublicId: row.assigned_user_public_id,
    assignmentUpdatedAt: row.assignment_updated_at,
    assignmentUpdatedByUserPublicId: row.assignment_updated_by_user_public_id,
    assignmentHistory: row.assignment_history as unknown as ScrumBacklogItemDocProps["assignmentHistory"],
    storyPoints: row.story_points,
    priorityLevel: row.priority_level,
    acceptanceCriteria: row.acceptance_criteria as unknown as ScrumBacklogItemDocProps["acceptanceCriteria"],
    commentsCount: row.comments_count,
    kanbanColumnPublicId: row.kanban_column_public_id,
    isBlocked: row.is_blocked,
    blockedReason: row.blocked_reason,
  }
}

export async function workItemRowToState(
  row: WorkItem,
  parentPublicId: string | null,
): Promise<ScrumBacklogItemState> {
  const doc = workItemRowToDocProps(row)
  doc.parentItemPublicId = parentPublicId
  return docToScrumBacklogItemState(doc)
}

export function stateToWorkItemCreate(
  state: ScrumBacklogItemState,
  ids: {
    workspaceId: string
    projectId: string
    parentItemId: string | null
    kanbanColumnId?: string | null
    completedInSprintId?: string | null
  },
): Prisma.WorkItemUncheckedCreateInput {
  return {
    public_id: state.backlogItemPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: state.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: state.projectPublicId,
    parent_item_id: ids.parentItemId,
    item_type: state.itemType,
    title: state.title,
    description: state.description,
    status: state.status,
    sort_order: state.sortOrder,
    created_by_user_public_id: state.createdByUserPublicId,
    completed_in_sprint_public_id: state.completedInSprintPublicId,
    completed_in_sprint_id: ids.completedInSprintId ?? null,
    assigned_user_public_id: state.assignedUserPublicId,
    assignment_updated_at: state.assignmentUpdatedAt,
    assignment_updated_by_user_public_id: state.assignmentUpdatedByUserPublicId,
    assignment_history: state.assignmentHistory as Prisma.InputJsonValue,
    story_points: state.storyPoints,
    priority_level: state.priorityLevel,
    acceptance_criteria: state.acceptanceCriteria as Prisma.InputJsonValue,
    comments_count: state.commentsCount,
    kanban_column_public_id: state.kanbanColumnPublicId,
    kanban_column_id: ids.kanbanColumnId ?? null,
    is_blocked: state.isBlocked,
    blocked_reason: state.blockedReason,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}
