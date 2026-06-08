import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"

export function readToColumnPublicId(nextValue: unknown): string | null {
  if (!nextValue || typeof nextValue !== "object") return null
  const o = nextValue as Record<string, unknown>
  if (typeof o.toColumnPublicId === "string") return o.toColumnPublicId
  if (typeof o.kanbanColumnPublicId === "string") return o.kanbanColumnPublicId
  return null
}

export function readEntryColumnFromRelease(nextValue: unknown): string | null {
  if (!nextValue || typeof nextValue !== "object") return null
  const o = nextValue as Record<string, unknown>
  if (typeof o.kanbanColumnPublicId === "string") return o.kanbanColumnPublicId
  return null
}

/** Eventos necesarios para throughput, aging y lead time (replay). */
export const KANBAN_METRICS_AUDIT_CATEGORIES = ["kanban_backlog_item", "kanban_board_item"] as const

export const KANBAN_METRICS_AUDIT_ACTIONS = [
  "released_to_flow",
  "returned_to_backlog",
  "moved_between_columns",
] as const

export function groupAuditByItemId(rows: WorkspaceAuditLogListRow[]): Map<string, WorkspaceAuditLogListRow[]> {
  const m = new Map<string, WorkspaceAuditLogListRow[]>()
  for (const r of rows) {
    const id = r.resourceBacklogItemPublicId
    if (id === null || id === undefined) continue
    const list = m.get(id)
    if (list) list.push(r)
    else m.set(id, [r])
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  }
  return m
}

export function medianNumber(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}
