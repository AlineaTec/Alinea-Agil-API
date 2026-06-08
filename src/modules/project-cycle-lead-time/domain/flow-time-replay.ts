import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import {
  groupAuditByItemId,
  readEntryColumnFromRelease,
  readToColumnPublicId,
} from "../../project-kanban-metrics/services/kanban-metrics-audit.helpers.js"
import type { FlowTimeSemanticColumnIds } from "./flow-time-column-roles.js"

export function readFromColumnPublicId(prevValue: unknown): string | null {
  if (!prevValue || typeof prevValue !== "object") return null
  const o = prevValue as Record<string, unknown>
  if (typeof o.fromColumnPublicId === "string") return o.fromColumnPublicId
  return null
}

/** Una finalización a terminal con los anclajes de carrera (v1: una fila por ítem). */
export type FlowTimeCompletion = {
  backlogItemPublicId: string
  doneAt: Date
  leadStartedAt: Date
  cycleStartedAt: Date | null
}

/**
 * Reproduce eventos y emite **todas** las finalizaciones a terminal, en orden.
 * Última en ventana se elige luego (callsite).
 */
export function replayCompletionsForItem(
  itemId: string,
  evs: WorkspaceAuditLogListRow[],
  cols: FlowTimeSemanticColumnIds,
): FlowTimeCompletion[] {
  const { flowEntryColumnPublicId, executionStartColumnPublicId, terminalColumnPublicId } = cols
  const results: FlowTimeCompletion[] = []

  let leadStartAt: Date | null = null
  let cycleStartAt: Date | null = null

  for (const e of evs) {
    if (e.category === "kanban_backlog_item" && e.action === "returned_to_backlog") {
      leadStartAt = null
      cycleStartAt = null
      continue
    }
    if (e.category === "kanban_backlog_item" && e.action === "released_to_flow") {
      leadStartAt = e.occurredAt
      cycleStartAt = null
      const entry = readEntryColumnFromRelease(e.nextValue)
      if (entry && entry === flowEntryColumnPublicId && executionStartColumnPublicId === flowEntryColumnPublicId) {
        cycleStartAt = e.occurredAt
      }
      continue
    }
    if (e.category === "kanban_board_item" && e.action === "moved_between_columns") {
      const to = readToColumnPublicId(e.nextValue)
      const from = readFromColumnPublicId(e.previousValue)
      if (!to) continue

      if (to === terminalColumnPublicId) {
        if (leadStartAt) {
          results.push({
            backlogItemPublicId: itemId,
            doneAt: e.occurredAt,
            leadStartedAt: leadStartAt,
            cycleStartedAt: cycleStartAt,
          })
        }
        leadStartAt = null
        cycleStartAt = null
        continue
      }
      if (from === terminalColumnPublicId) {
        leadStartAt = null
        cycleStartAt = null
        continue
      }
      if (to === flowEntryColumnPublicId && !leadStartAt) {
        leadStartAt = e.occurredAt
        continue
      }
      if (
        executionStartColumnPublicId &&
        to === executionStartColumnPublicId &&
        cycleStartAt === null
      ) {
        cycleStartAt = e.occurredAt
        if (!leadStartAt) {
          leadStartAt = e.occurredAt
        }
        continue
      }
    }
  }
  return results
}

/**
 * De todas las finalizaciones de un ítem, toma la **última** cuyo `doneAt` esté en `[from, to)`.
 */
export function lastCompletionInWindow(
  all: FlowTimeCompletion[],
  from: Date,
  to: Date,
): FlowTimeCompletion | null {
  const inWin = all.filter((c) => c.doneAt.getTime() >= from.getTime() && c.doneAt.getTime() < to.getTime())
  if (inWin.length === 0) return null
  return inWin.reduce((a, b) => (a.doneAt.getTime() >= b.doneAt.getTime() ? a : b))
}

export function groupItemEvents(rows: WorkspaceAuditLogListRow[]): Map<string, WorkspaceAuditLogListRow[]> {
  return groupAuditByItemId(rows)
}
