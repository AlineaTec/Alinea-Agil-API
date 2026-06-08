import type { ScrumBacklogItemType } from "../../project-scrum-backlog/domain/backlog-item-type.js"

/** v1 (project-work-assignment / contracts): solo estos tipos admiten asignación a persona. */
export const PROJECT_WORK_ASSIGNABLE_ITEM_TYPES: readonly ScrumBacklogItemType[] = [
  "user_story",
  "task",
  "subtask",
] as const

const SET = new Set<string>(PROJECT_WORK_ASSIGNABLE_ITEM_TYPES)

export function isProjectWorkAssignableItemType(
  t: string,
): t is (typeof PROJECT_WORK_ASSIGNABLE_ITEM_TYPES)[number] {
  return SET.has(t)
}
