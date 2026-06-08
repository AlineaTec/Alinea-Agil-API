/** Estados básicos del ítem (MVP). */
export const SCRUM_BACKLOG_ITEM_STATUSES = ["open", "in_progress", "done"] as const

export type ScrumBacklogItemStatus = (typeof SCRUM_BACKLOG_ITEM_STATUSES)[number]

export function isScrumBacklogItemStatus(v: string): v is ScrumBacklogItemStatus {
  return (SCRUM_BACKLOG_ITEM_STATUSES as readonly string[]).includes(v)
}
