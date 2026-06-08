export const SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const

export type ScrumBacklogItemPriorityLevel = (typeof SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS)[number]

export function isScrumBacklogItemPriorityLevel(v: string): v is ScrumBacklogItemPriorityLevel {
  return (SCRUM_BACKLOG_ITEM_PRIORITY_LEVELS as readonly string[]).includes(v)
}
