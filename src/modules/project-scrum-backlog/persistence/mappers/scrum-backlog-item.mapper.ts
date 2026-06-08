import { isWorkItemAssignmentChangeType } from "../../../work-item-assignment/domain/work-item-assignment-change-type.js"
import { isAcceptanceCriterionStatus } from "../../domain/acceptance-criterion-status.js"
import type { AcceptanceCriterionState } from "../../domain/acceptance-criterion.js"
import { isScrumBacklogItemPriorityLevel } from "../../domain/backlog-item-priority-level.js"
import { isScrumBacklogItemStatus } from "../../domain/backlog-item-status.js"
import { isScrumBacklogItemType, type ScrumBacklogItemType } from "../../domain/backlog-item-type.js"
import type { ScrumBacklogItemState } from "../../domain/scrum-backlog-item.js"
import type { ScrumBacklogItemDocProps } from "../schemas/scrum-backlog-item.schema.js"

function mapAssignmentHistory(
  raw: ScrumBacklogItemDocProps["assignmentHistory"],
): ScrumBacklogItemState["assignmentHistory"] {
  if (!raw || !Array.isArray(raw)) return []
  const out: ScrumBacklogItemState["assignmentHistory"] = []
  for (const row of raw) {
    if (typeof row.assignmentEventId !== "string") continue
    if (!(row.changedAt instanceof Date)) continue
    if (typeof row.changedByUserPublicId !== "string") continue
    if (typeof row.changeType !== "string" || !isWorkItemAssignmentChangeType(row.changeType)) continue
    out.push({
      assignmentEventId: row.assignmentEventId,
      changedAt: row.changedAt,
      changedByUserPublicId: row.changedByUserPublicId,
      previousAssignedUserPublicId:
        row.previousAssignedUserPublicId === undefined || row.previousAssignedUserPublicId === null
          ? null
          : String(row.previousAssignedUserPublicId),
      newAssignedUserPublicId:
        row.newAssignedUserPublicId === undefined || row.newAssignedUserPublicId === null
          ? null
          : String(row.newAssignedUserPublicId),
      changeType: row.changeType,
    })
  }
  return out
}

function mapAcceptanceCriteria(
  itemType: ScrumBacklogItemType,
  raw: ScrumBacklogItemDocProps["acceptanceCriteria"],
): AcceptanceCriterionState[] {
  if (itemType === "epic" || itemType === "subtask") {
    return []
  }
  if (!raw || !Array.isArray(raw)) return []
  const out: AcceptanceCriterionState[] = []
  for (const row of raw) {
    if (typeof row.acceptanceCriterionPublicId !== "string") continue
    if (typeof row.text !== "string") continue
    if (typeof row.status !== "string" || !isAcceptanceCriterionStatus(row.status)) continue
    if (!(row.createdAt instanceof Date) || !(row.updatedAt instanceof Date)) continue
    out.push({
      acceptanceCriterionPublicId: row.acceptanceCriterionPublicId,
      text: row.text,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
  return out
}

export function docToScrumBacklogItemState(doc: ScrumBacklogItemDocProps): ScrumBacklogItemState {
  if (!isScrumBacklogItemType(doc.itemType)) {
    throw new Error(`invalid_scrum_backlog_item_type_persisted:${doc.itemType}`)
  }
  if (!isScrumBacklogItemStatus(doc.status)) {
    throw new Error(`invalid_scrum_backlog_item_status_persisted:${doc.status}`)
  }

  let storyPoints: number | null = null
  if (doc.itemType !== "epic" && doc.itemType !== "subtask") {
    if (doc.storyPoints !== undefined && doc.storyPoints !== null) {
      if (typeof doc.storyPoints !== "number" || !Number.isInteger(doc.storyPoints)) {
        throw new Error(`invalid_scrum_backlog_story_points_persisted:${doc.storyPoints}`)
      }
      storyPoints = doc.storyPoints
    }
  }

  const rawPriority = doc.priorityLevel === undefined || doc.priorityLevel === null ? "none" : doc.priorityLevel
  if (typeof rawPriority !== "string" || !isScrumBacklogItemPriorityLevel(rawPriority)) {
    throw new Error(`invalid_scrum_backlog_priority_level_persisted:${rawPriority}`)
  }

  return {
    backlogItemPublicId: doc.backlogItemPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    itemType: doc.itemType,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    sortOrder: doc.sortOrder,
    parentItemPublicId: doc.parentItemPublicId ?? null,
    createdByUserPublicId: doc.createdByUserPublicId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedInSprintPublicId: doc.completedInSprintPublicId ?? null,
    assignedUserPublicId:
      doc.assignedUserPublicId === undefined || doc.assignedUserPublicId === null
        ? null
        : doc.assignedUserPublicId,
    assignmentUpdatedAt:
      doc.assignmentUpdatedAt === undefined || doc.assignmentUpdatedAt === null
        ? null
        : doc.assignmentUpdatedAt,
    assignmentUpdatedByUserPublicId:
      doc.assignmentUpdatedByUserPublicId === undefined || doc.assignmentUpdatedByUserPublicId === null
        ? null
        : doc.assignmentUpdatedByUserPublicId,
    assignmentHistory: mapAssignmentHistory(doc.assignmentHistory),
    storyPoints,
    priorityLevel: rawPriority,
    acceptanceCriteria: mapAcceptanceCriteria(doc.itemType, doc.acceptanceCriteria),
    commentsCount:
      typeof doc.commentsCount === "number" && Number.isFinite(doc.commentsCount) && doc.commentsCount >= 0
        ? doc.commentsCount
        : 0,
    kanbanColumnPublicId:
      doc.kanbanColumnPublicId === undefined || doc.kanbanColumnPublicId === null
        ? null
        : String(doc.kanbanColumnPublicId),
    isBlocked: doc.isBlocked === true,
    blockedReason:
      doc.blockedReason === undefined || doc.blockedReason === null || String(doc.blockedReason).trim() === ""
        ? null
        : String(doc.blockedReason).slice(0, 2000),
  }
}
