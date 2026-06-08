import type { KanbanWipEnforcement } from "./kanban-flow.js"

const DEFAULT_NEAR = 0.8

export { DEFAULT_NEAR as KANBAN_WIP_V1_DEFAULT_NEAR_THRESHOLD_RATIO }

/**
 * v1: por posición 0=Ready, 1=In Progress, 2=Review, 3=Done; columnas adicionales sin límite.
 * No depende del nombre mostrado; la plantilla base usa 4 posiciones 0..3.
 */
export function getDefaultWipForKanbanColumnPosition(position: number): {
  wipLimit: number | null
  wipEnforcement: KanbanWipEnforcement
} {
  switch (position) {
    case 0:
      return { wipLimit: null, wipEnforcement: "informational" }
    case 1:
      return { wipLimit: 3, wipEnforcement: "blocking" }
    case 2:
      return { wipLimit: 1, wipEnforcement: "blocking" }
    case 3:
      return { wipLimit: null, wipEnforcement: "informational" }
    default:
      return { wipLimit: null, wipEnforcement: "informational" }
  }
}
