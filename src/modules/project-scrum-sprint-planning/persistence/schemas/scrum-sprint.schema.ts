import { SPRINT_BOARD_COLUMNS } from "../../../project-scrum-sprint-board/domain/sprint-board-column.js"
import { SCRUM_SPRINT_STATUSES } from "../../domain/sprint-status.js"

const SPRINT_CLOSURE_OUTCOMES = ["completed", "not_completed"] as const

export type SprintClosureItemDoc = {
  backlogItemPublicId: string
  itemType: string
  title: string
  finalBoardColumn: (typeof SPRINT_BOARD_COLUMNS)[number]
  outcome: (typeof SPRINT_CLOSURE_OUTCOMES)[number]
  backlogStatusAtClosure: string
  sprintSortOrder: number
  /** Congelado al cierre; opcional en documentos legacy. */
  storyPointsAtClosure?: number | null
  acceptanceCriteriaTotalCount?: number
  acceptanceCriteriaPendingCount?: number
  acceptanceCriteriaDoneCount?: number
  acceptanceCriteriaReviewedCount?: number
}

export type SprintClosureDoc = {
  closedAt: Date
  closedByUserPublicId: string
  closureNote: string
  goalAchieved: boolean
  sprintGoalAtClosure: string
  items: SprintClosureItemDoc[]
}

/** Subdocumento hermano de `closure`; no anidado dentro del snapshot de cierre. */
export type SprintReviewDoc = {
  reviewPublicId: string
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  summary: string
  incrementReviewNotes: string
  decisions: string
  nextSteps: string
  createdByUserPublicId: string
  updatedByUserPublicId: string
  createdAt: Date
  updatedAt: Date
}

/** Elemento de `actionItems` embebido en la retrospectiva (MVP estructurado). */
export type SprintRetrospectiveActionItemDoc = {
  actionItemPublicId: string
  text: string
  ownerUserPublicId: string | null
  status: "open" | "done"
  createdAt: Date
  updatedAt: Date
}

/** Subdocumento hermano de `closure` y `review`; `actionItems` es lista estructurada. */
export type SprintRetrospectiveDoc = {
  retrospectivePublicId: string
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  wentWell: string
  didNotGoWell: string
  improvements: string
  actionItems: SprintRetrospectiveActionItemDoc[] | string
  createdByUserPublicId: string
  updatedByUserPublicId: string
  createdAt: Date
  updatedAt: Date
}

export interface ScrumSprintDocProps {
  sprintPublicId: string
  workspacePublicId: string
  projectPublicId: string
  name: string
  goal: string
  status: (typeof SCRUM_SPRINT_STATUSES)[number]
  startDate: Date | null
  endDate: Date | null
  createdByUserPublicId: string
  createdAt: Date
  updatedAt: Date
  closure?: SprintClosureDoc | null
  review?: SprintReviewDoc | null
  retrospective?: SprintRetrospectiveDoc | null
}
