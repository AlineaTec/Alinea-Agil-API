import { randomUUID } from "node:crypto"
import { KANBAN_DEFAULT_COLUMN_NAMES } from "./kanban-flow.constants.js"
import { getDefaultWipForKanbanColumnPosition } from "./kanban-flow-wip-defaults.js"
import type { KanbanColumnState } from "./kanban-flow.js"

export type DefaultKanbanFlowTemplate = {
  columns: KanbanColumnState[]
  /** Siempre la columna **Ready** (primera de la plantilla v1). */
  entryColumnPublicId: string
}

/**
 * Plantilla inicial: Ready → In Progress → Review → Done.
 * `entryColumnId` = primera columna (Ready).
 */
export function buildDefaultKanbanFlowTemplate(): DefaultKanbanFlowTemplate {
  const columns: KanbanColumnState[] = KANBAN_DEFAULT_COLUMN_NAMES.map((name, index) => {
    const w = getDefaultWipForKanbanColumnPosition(index)
    return {
      columnPublicId: randomUUID(),
      name,
      position: index,
      wipLimit: w.wipLimit,
      policyText: "",
      wipEnforcement: w.wipEnforcement,
    }
  })

  const ready = columns[0]
  if (!ready || ready.name !== "Ready") {
    throw new Error("kanban_default_template_invariant_failed")
  }

  return {
    columns,
    entryColumnPublicId: ready.columnPublicId,
  }
}
