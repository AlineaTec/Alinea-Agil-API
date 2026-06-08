import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"

/**
 * Columna terminal v1: nombre **Done** (case-insensitive); si no hay match, la de mayor `position`.
 */
export function resolveTerminalColumnPublicId(flow: ProjectKanbanFlowConfigState): string {
  const named = flow.columns.find((c) => c.name.trim().toLowerCase() === "done")
  if (named) return named.columnPublicId
  if (flow.columns.length === 0) {
    throw new Error("kanban_flow_has_no_columns")
  }
  const sorted = flow.columns.slice().sort((a, b) => b.position - a.position)
  return sorted[0]!.columnPublicId
}
