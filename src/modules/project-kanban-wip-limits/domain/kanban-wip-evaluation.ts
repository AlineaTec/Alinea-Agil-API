import type { KanbanColumnState, ProjectKanbanFlowConfigState, KanbanWipEnforcement } from "../../project-kanban-core/domain/kanban-flow.js"

export type KanbanWipColumnVisualState = "none" | "normal" | "near" | "at_limit" | "exceeded"

export type WipColumnEvaluation = {
  columnPublicId: string
  currentCount: number
  limit: number | null
  ratio: number | null
  state: KanbanWipColumnVisualState
  policy: KanbanWipEnforcement
  nearThresholdRatio: number
  /** `true` si un add de 1 se aceptaría sin ack/override bajo v1. */
  canProceedMoveIn: boolean
  requiresConfirmationForNextAdd: boolean
  requiresOverrideForNextAdd: boolean
}

export type WipMoveCheckResult =
  | { outcome: "allow" }
  | { outcome: "need_ack"; payload: WipColumnSnapshot }
  | { outcome: "wip_blocked"; payload: WipColumnSnapshot }
  | { outcome: "override_forbidden"; payload: WipColumnSnapshot }

export type WipColumnSnapshot = {
  current_count: number
  limit: number
  to_column_public_id: string
  policy: KanbanWipEnforcement
  projected_count_after_move: number
}

export function computeWipColumnVisualState(
  currentCount: number,
  limit: number | null,
  nearThresholdRatio: number,
): KanbanWipColumnVisualState {
  if (limit === null) return "none"
  if (currentCount > limit) return "exceeded"
  if (currentCount === limit) return "at_limit"
  if (currentCount / limit >= nearThresholdRatio) return "near"
  return "normal"
}

function snapshotFrom(
  toCol: KanbanColumnState,
  inDest: number,
  limit: number,
  projected: number,
): WipColumnSnapshot {
  return {
    current_count: inDest,
    limit,
    to_column_public_id: toCol.columnPublicId,
    policy: toCol.wipEnforcement,
    projected_count_after_move: projected,
  }
}

/**
 * Revisa si se puede añadir 1 ítem a la columna `toCol` con `inDest` ítems actuales.
 * v1: `informational` nunca frena; `warning` pide ack si `inDest+1 >= limit`;
 * `blocking` bloquea si `inDest+1 > limit` salvo override con rol+razón.
 */
export function checkKanbanWipMove(
  toCol: KanbanColumnState,
  inDest: number,
  hasMoveAck: boolean,
  overrideReasonTrimmed: string | null,
  actorCanOverride: boolean,
): WipMoveCheckResult {
  const limit = toCol.wipLimit
  const pol = toCol.wipEnforcement
  const projected = inDest + 1

  if (limit === null || pol === "informational") {
    return { outcome: "allow" }
  }

  if (pol === "warning") {
    if (projected < limit) {
      return { outcome: "allow" }
    }
    if (hasMoveAck) {
      return { outcome: "allow" }
    }
    return { outcome: "need_ack", payload: snapshotFrom(toCol, inDest, limit, projected) }
  }

  // blocking
  if (projected <= limit) {
    return { outcome: "allow" }
  }

  const hasReason = (overrideReasonTrimmed?.length ?? 0) > 0
  const snap = snapshotFrom(toCol, inDest, limit, projected)
  if (!hasReason) {
    return { outcome: "wip_blocked", payload: snap }
  }
  if (!actorCanOverride) {
    return { outcome: "override_forbidden", payload: snap }
  }
  return { outcome: "allow" }
}

export function makeWipColumnEvaluationForRead(
  col: KanbanColumnState,
  currentCount: number,
  flow: ProjectKanbanFlowConfigState,
): WipColumnEvaluation {
  const limit = col.wipLimit
  const nearR = flow.wipNearThresholdRatio
  const ratio = limit !== null && limit > 0 ? currentCount / limit : null
  const state = computeWipColumnVisualState(currentCount, limit, nearR)
  const projected = currentCount + 1

  const requiresConfirmationForNextAdd = limit !== null && col.wipEnforcement === "warning" && projected >= limit
  const requiresOverrideForNextAdd = limit !== null && col.wipEnforcement === "blocking" && projected > limit

  const canProceedMoveIn =
    limit === null ||
    col.wipEnforcement === "informational" ||
    (col.wipEnforcement === "warning" && projected < limit) ||
    (col.wipEnforcement === "blocking" && projected <= limit)

  return {
    columnPublicId: col.columnPublicId,
    currentCount,
    limit,
    ratio,
    state,
    policy: col.wipEnforcement,
    nearThresholdRatio: nearR,
    canProceedMoveIn,
    requiresConfirmationForNextAdd,
    requiresOverrideForNextAdd,
  }
}
