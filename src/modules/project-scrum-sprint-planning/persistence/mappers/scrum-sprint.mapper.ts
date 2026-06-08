import { isSprintBoardColumn } from "../../../project-scrum-sprint-board/domain/sprint-board-column.js"
import type { SprintClosureSnapshotItem, SprintClosureState } from "../../domain/sprint-closure.js"
import type { ScrumSprintStatus } from "../../domain/sprint-status.js"
import type { ScrumSprintState } from "../../domain/scrum-sprint.js"
import type {
  ScrumSprintDocProps,
  SprintClosureDoc,
  SprintRetrospectiveActionItemDoc,
  SprintRetrospectiveDoc,
  SprintReviewDoc,
} from "../schemas/scrum-sprint.schema.js"
import type {
  SprintRetrospectiveActionItemState,
  SprintRetrospectiveState,
} from "../../domain/sprint-retrospective.js"
import type { SprintReviewState } from "../../domain/sprint-review.js"

function coerceDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function parseClosure(doc: SprintClosureDoc | null | undefined): SprintClosureState | null {
  if (!doc || !doc.closedAt) return null
  const items: SprintClosureSnapshotItem[] = []
  for (const row of doc.items ?? []) {
    if (!isSprintBoardColumn(row.finalBoardColumn)) {
      throw new Error(`invalid_closure_board_column:${row.finalBoardColumn}`)
    }
    if (row.outcome !== "completed" && row.outcome !== "not_completed") {
      throw new Error(`invalid_closure_outcome:${row.outcome}`)
    }
    const item: SprintClosureSnapshotItem = {
      backlogItemPublicId: row.backlogItemPublicId,
      itemType: row.itemType,
      title: row.title,
      finalBoardColumn: row.finalBoardColumn,
      outcome: row.outcome,
      backlogStatusAtClosure: row.backlogStatusAtClosure,
      sprintSortOrder: row.sprintSortOrder,
    }
    if (row.storyPointsAtClosure !== undefined) {
      item.storyPointsAtClosure = row.storyPointsAtClosure
    }
    if (row.acceptanceCriteriaTotalCount !== undefined) {
      item.acceptanceCriteriaTotalCount = row.acceptanceCriteriaTotalCount
    }
    if (row.acceptanceCriteriaPendingCount !== undefined) {
      item.acceptanceCriteriaPendingCount = row.acceptanceCriteriaPendingCount
    }
    if (row.acceptanceCriteriaDoneCount !== undefined) {
      item.acceptanceCriteriaDoneCount = row.acceptanceCriteriaDoneCount
    }
    if (row.acceptanceCriteriaReviewedCount !== undefined) {
      item.acceptanceCriteriaReviewedCount = row.acceptanceCriteriaReviewedCount
    }
    items.push(item)
  }
  return {
    closedAt: coerceDate(doc.closedAt),
    closedByUserPublicId: doc.closedByUserPublicId,
    closureNote: doc.closureNote,
    goalAchieved: doc.goalAchieved,
    sprintGoalAtClosure: doc.sprintGoalAtClosure,
    items,
  }
}

function parseReview(doc: SprintReviewDoc | null | undefined): SprintReviewState | null {
  if (!doc || !doc.reviewPublicId) return null
  return {
    reviewPublicId: doc.reviewPublicId,
    sprintPublicId: doc.sprintPublicId,
    projectPublicId: doc.projectPublicId,
    workspacePublicId: doc.workspacePublicId,
    summary: doc.summary ?? "",
    incrementReviewNotes: doc.incrementReviewNotes ?? "",
    decisions: doc.decisions ?? "",
    nextSteps: doc.nextSteps ?? "",
    createdByUserPublicId: doc.createdByUserPublicId,
    updatedByUserPublicId: doc.updatedByUserPublicId,
    createdAt: coerceDate(doc.createdAt),
    updatedAt: coerceDate(doc.updatedAt),
  }
}

function isActionItemStatus(v: string): v is SprintRetrospectiveActionItemState["status"] {
  return v === "open" || v === "done"
}

function parseActionItemDoc(row: SprintRetrospectiveActionItemDoc): SprintRetrospectiveActionItemState | null {
  if (typeof row.actionItemPublicId !== "string" || !row.actionItemPublicId) return null
  if (typeof row.text !== "string") return null
  if (!isActionItemStatus(row.status)) return null
  let owner: string | null = null
  if (row.ownerUserPublicId !== null && row.ownerUserPublicId !== undefined) {
    if (typeof row.ownerUserPublicId !== "string") return null
    owner = row.ownerUserPublicId
  }
  return {
    actionItemPublicId: row.actionItemPublicId,
    text: row.text,
    ownerUserPublicId: owner,
    status: row.status,
    createdAt: coerceDate(row.createdAt),
    updatedAt: coerceDate(row.updatedAt),
  }
}

/** Normaliza `actionItems` desde BSON (array estructurado o string legacy). */
function normalizeRetrospectiveActionItems(
  doc: SprintRetrospectiveDoc,
): SprintRetrospectiveActionItemState[] {
  const raw = doc.actionItems as unknown
  if (typeof raw === "string") {
    const s = raw.trim()
    if (!s) return []
    return [
      {
        actionItemPublicId: `${doc.retrospectivePublicId}-legacy-action`,
        text: s,
        ownerUserPublicId: null,
        status: "open",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    ]
  }
  if (!Array.isArray(raw)) return []
  const out: SprintRetrospectiveActionItemState[] = []
  for (const el of raw) {
    if (!el || typeof el !== "object") continue
    const parsed = parseActionItemDoc(el as SprintRetrospectiveActionItemDoc)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseRetrospective(doc: SprintRetrospectiveDoc | null | undefined): SprintRetrospectiveState | null {
  if (!doc || !doc.retrospectivePublicId) return null
  return {
    retrospectivePublicId: doc.retrospectivePublicId,
    sprintPublicId: doc.sprintPublicId,
    projectPublicId: doc.projectPublicId,
    workspacePublicId: doc.workspacePublicId,
    wentWell: doc.wentWell ?? "",
    didNotGoWell: doc.didNotGoWell ?? "",
    improvements: doc.improvements ?? "",
    actionItems: normalizeRetrospectiveActionItems(doc),
    createdByUserPublicId: doc.createdByUserPublicId,
    updatedByUserPublicId: doc.updatedByUserPublicId,
    createdAt: coerceDate(doc.createdAt),
    updatedAt: coerceDate(doc.updatedAt),
  }
}

export function docToScrumSprintState(doc: ScrumSprintDocProps): ScrumSprintState {
  return {
    sprintPublicId: doc.sprintPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    name: doc.name,
    goal: doc.goal,
    status: doc.status as ScrumSprintStatus,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    createdByUserPublicId: doc.createdByUserPublicId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    closure: parseClosure(doc.closure ?? null),
    review: parseReview(doc.review ?? null),
    retrospective: parseRetrospective(doc.retrospective ?? null),
  }
}
