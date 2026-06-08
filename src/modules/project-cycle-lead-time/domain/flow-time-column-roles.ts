import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import { resolveTerminalColumnPublicId } from "../../project-kanban-metrics/services/kanban-flow-terminal.js"

/**
 * Mapeo v1 (sin columnSemanticRole persistido aún en PKC):
 * - `flow_entry` = `entryColumnPublicId` del flujo
 * - `execution_start` = primera columna estrictamente entre entrada y columna terminal (p. ej. "In Progress")
 * - `done` = columna terminal (nombre "Done" o mayor posición, ver kanban-flow-terminal)
 */
export type FlowTimeSemanticColumnIds = {
  flowEntryColumnPublicId: string
  executionStartColumnPublicId: string | null
  terminalColumnPublicId: string
}

export function resolveFlowTimeSemanticColumns(flow: ProjectKanbanFlowConfigState): FlowTimeSemanticColumnIds {
  const terminalColumnPublicId = resolveTerminalColumnPublicId(flow)
  const sorted = flow.columns.slice().sort((a, b) => a.position - b.position)
  const entryIdx = sorted.findIndex((c) => c.columnPublicId === flow.entryColumnPublicId)
  if (entryIdx < 0) {
    return {
      flowEntryColumnPublicId: flow.entryColumnPublicId,
      executionStartColumnPublicId: null,
      terminalColumnPublicId,
    }
  }
  const afterEntry = sorted.slice(entryIdx + 1)
  const beforeDone = afterEntry.filter((c) => c.columnPublicId !== terminalColumnPublicId)
  const firstWorkColumn = beforeDone[0] ?? null
  const executionStartColumnPublicId = firstWorkColumn?.columnPublicId ?? null
  return {
    flowEntryColumnPublicId: flow.entryColumnPublicId,
    executionStartColumnPublicId,
    terminalColumnPublicId,
  }
}
