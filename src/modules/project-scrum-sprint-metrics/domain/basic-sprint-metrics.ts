import type { SprintBoardColumn } from "../../project-scrum-sprint-board/domain/sprint-board-column.js"
import type { ScrumSprintStatus } from "../../project-scrum-sprint-planning/domain/sprint-status.js"
import type { SprintMetricsV2Computed } from "./sprint-metrics-v2.aggregation.js"

/** Conteos por columna final del board al cierre (MVP). */
export type FinalBoardDistribution = Record<SprintBoardColumn, number>

/**
 * Resumen de métricas derivado del snapshot de cierre (solo lectura).
 * Incluye núcleo por conteos y extensión **Sprint Metrics v2** (puntos y señales congeladas al cierre).
 */
export type BasicSprintMetrics = {
  sprintPublicId: string
  projectPublicId: string
  workspacePublicId: string
  status: ScrumSprintStatus
  goalAchieved: boolean
  goalAtClosure: string
  closedAt: string
  committedItemsCount: number
  completedItemsCount: number
  notCompletedItemsCount: number
  /** Entero 0–100; `null` si no hay ítems comprometidos en el snapshot (denominador 0). */
  completionPercentage: number | null
  finalBoardDistribution: FinalBoardDistribution
  /**
   * Días calendario inclusivos entre `startDate` y `endDate` del sprint (UTC fecha-solo).
   * `null` si falta alguna fecha o el rango es inválido.
   */
  plannedDurationDays: number | null
} & SprintMetricsV2Computed
