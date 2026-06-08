export const SCRUM_BACKLOG_ITEM_TYPES = ["epic", "user_story", "task", "subtask", "bug"] as const

export type ScrumBacklogItemType = (typeof SCRUM_BACKLOG_ITEM_TYPES)[number]

export function isScrumBacklogItemType(v: string): v is ScrumBacklogItemType {
  return (SCRUM_BACKLOG_ITEM_TYPES as readonly string[]).includes(v)
}
