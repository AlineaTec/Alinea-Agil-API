import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"

export type SprintClosureOutcome = "completed" | "not_completed"

/**
 * Una fila inmutable del snapshot al cerrar el sprint.
 * Campos `storyPointsAtClosure` y `acceptanceCriteria*Count` se congelan al cierre (Sprint Metrics v2).
 * Cierres anteriores al despliegue pueden no incluirlos; el endpoint de métricas v2 rechaza esos snapshots.
 */
export type SprintClosureSnapshotItem = {
  backlogItemPublicId: string
  itemType: string
  title: string
  finalBoardColumn: SprintBoardColumn
  outcome: SprintClosureOutcome
  /** `status` del ítem en product backlog en el instante del cierre. */
  backlogStatusAtClosure: string
  sprintSortOrder: number
  /**
   * Puntos de historia congelados al cierre (`null` si no había estimación).
   * Tipos en snapshot de cierre (MVP): solo `user_story` y `task`.
   */
  storyPointsAtClosure?: number | null
  acceptanceCriteriaTotalCount?: number
  acceptanceCriteriaPendingCount?: number
  acceptanceCriteriaDoneCount?: number
  acceptanceCriteriaReviewedCount?: number
}

/** Snapshot de cierre persistido en el sprint (jsonb). */
export type SprintClosureState = {
  closedAt: Date
  closedByUserPublicId: string
  closureNote: string
  goalAchieved: boolean
  /** Copia del objetivo del sprint para lectura histórica. */
  sprintGoalAtClosure: string
  items: SprintClosureSnapshotItem[]
}
