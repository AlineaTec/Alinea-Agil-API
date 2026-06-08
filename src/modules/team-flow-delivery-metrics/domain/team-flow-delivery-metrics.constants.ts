import type { MethodologyContext } from "./team-flow-delivery-metrics.dto.js"

/** Items activos (no épicas) con antigüedad estrictamente mayor a este umbral (días calendario UTC). */
export const FLOW_AGING_STALE_DAYS = 30

/** Ventana por defecto (días) para throughput y reasignaciones (rolling, UTC, extremo [from,to] inclusivo en ms). v1. */
export const FLOW_DEFAULT_ROLLING_WINDOW_DAYS = 7

export const FRICTION_HIGH_UNASSIGNED_RATIO = 0.35

export const FRICTION_MANY_REASSIGNMENTS_IN_WINDOW = 8

/**
 * Códigos estables (contrato HTTP). Alinear con contracts-docs `api-needs` §6 y extender aquí.
 */
export const DataQualityWarningCode = {
  INSUFFICIENT_CLOSURES: "INSUFFICIENT_CLOSURES",
  INSUFFICIENT_ASSIGNMENT_COVERAGE: "INSUFFICIENT_ASSIGNMENT_COVERAGE",
  PARTIAL_ASSIGNMENT_HISTORY: "PARTIAL_ASSIGNMENT_HISTORY",
  METHODOLOGY_MIX: "METHODOLOGY_MIX",
  BLOCKED_NOT_APPLICABLE: "BLOCKED_NOT_APPLICABLE",
  CARRY_OVER_SOURCE_GAPS: "CARRY_OVER_SOURCE_GAPS",
  LOW_THROUGHPUT_VOLUME: "LOW_THROUGHPUT_VOLUME",
  NO_LINKED_PROJECTS: "NO_LINKED_PROJECTS",
  ASSIGNMENT_QUALITY_NOT_VISIBLE: "ASSIGNMENT_QUALITY_NOT_VISIBLE",
  SCRUM_CARRY_NOT_APPLICABLE: "SCRUM_CARRY_NOT_APPLICABLE",
  THROUGHPUT_USES_ITEM_UPDATED_AT: "THROUGHPUT_USES_ITEM_UPDATED_AT_PROXY",
} as const

export const FlowFrictionCode = {
  STALE_ACTIVE_WORK: "stale_active_work",
  ELEVATED_UNASSIGNED: "elevated_unassigned_work",
  MANY_REASSIGNMENTS: "many_reassignments_in_window",
  BLOCKED_ITEMS_PRESENT: "blocked_work_items_in_flow",
} as const

export function methodologyFlagsFrom(
  byApproach: { scrum: number; kanban: number; other: number },
): MethodologyContext {
  if (byApproach.scrum > 0 && byApproach.kanban > 0) return "mixed"
  if (byApproach.scrum > 0) return "scrum"
  if (byApproach.kanban > 0) return "kanban"
  if (byApproach.other > 0) return "other"
  return "unknown"
}
