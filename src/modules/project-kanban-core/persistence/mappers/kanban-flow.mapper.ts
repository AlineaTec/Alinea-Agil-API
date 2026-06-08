import { getDefaultWipForKanbanColumnPosition, KANBAN_WIP_V1_DEFAULT_NEAR_THRESHOLD_RATIO } from "../../domain/kanban-flow-wip-defaults.js"
import type { KanbanColumnState, KanbanWipEnforcement } from "../../domain/kanban-flow.js"
import type { ProjectKanbanFlowConfigState } from "../../domain/kanban-flow.js"
import type { KanbanFlowDocProps } from "../schemas/kanban-flow.schema.js"

function parseWipEnforcement(raw: unknown, fallback: KanbanWipEnforcement): KanbanWipEnforcement {
  if (raw === "informational" || raw === "warning" || raw === "blocking") {
    return raw
  }
  return fallback
}

type KanbanColDoc = KanbanFlowDocProps["columns"][0] & { wipEnforcement?: unknown }

/**
 * v1: si no hay `wipEnforcement` persistido, aplica defaults por `position` (migración lógica de docs antiguos).
 * Con `wipEnforcement` guardado, se respeta `wipLimit` tal cual (null = sin límite).
 */
function normalizeColumn(docCol: KanbanColDoc): KanbanColumnState {
  const d = getDefaultWipForKanbanColumnPosition(docCol.position)
  const hasWipV1 = Object.prototype.hasOwnProperty.call(docCol, "wipEnforcement")
  if (!hasWipV1) {
    return {
      columnPublicId: docCol.columnPublicId,
      name: docCol.name,
      position: docCol.position,
      wipLimit: d.wipLimit,
      policyText: docCol.policyText ?? "",
      wipEnforcement: d.wipEnforcement,
    }
  }
  return {
    columnPublicId: docCol.columnPublicId,
    name: docCol.name,
    position: docCol.position,
    wipLimit: docCol.wipLimit === undefined || docCol.wipLimit === null ? null : Number(docCol.wipLimit),
    policyText: docCol.policyText ?? "",
    wipEnforcement: parseWipEnforcement(docCol.wipEnforcement, d.wipEnforcement),
  }
}

export function docToProjectKanbanFlowConfigState(doc: KanbanFlowDocProps & { createdAt?: Date; updatedAt?: Date }): ProjectKanbanFlowConfigState {
  const nearRaw = (doc as { wipNearThresholdRatio?: unknown }).wipNearThresholdRatio
  const wipNearThresholdRatio =
    typeof nearRaw === "number" && Number.isFinite(nearRaw) && nearRaw > 0 && nearRaw <= 1
      ? nearRaw
      : KANBAN_WIP_V1_DEFAULT_NEAR_THRESHOLD_RATIO
  return {
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    entryColumnPublicId: doc.entryColumnPublicId,
    wipNearThresholdRatio,
    columns: doc.columns.map((c) => normalizeColumn(c as KanbanColDoc)),
    createdAt: doc.createdAt ?? new Date(0),
    updatedAt: doc.updatedAt ?? new Date(0),
  }
}
