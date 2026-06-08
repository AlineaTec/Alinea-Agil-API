import type { ScrumBacklogItemType } from "../../project-scrum-backlog/domain/backlog-item-type.js"
import { KanbanBacklogValidationError } from "./kanban-backlog.errors.js"

const KANBAN_BACKLOG_CREATE_TYPES: readonly ScrumBacklogItemType[] = ["epic", "user_story", "task", "bug"]

const KANBAN_FLOW_RELEASABLE_TYPES: readonly ScrumBacklogItemType[] = ["bug", "task", "user_story"]

export function assertKanbanBacklogCreateItemType(itemType: ScrumBacklogItemType): void {
  if (!(KANBAN_BACKLOG_CREATE_TYPES as readonly string[]).includes(itemType)) {
    throw new KanbanBacklogValidationError(
      `Kanban backlog v1 supports creating types: ${KANBAN_BACKLOG_CREATE_TYPES.join(", ")}.`,
    )
  }
}

export function assertKanbanItemReleasableToFlow(itemType: ScrumBacklogItemType): void {
  if (!(KANBAN_FLOW_RELEASABLE_TYPES as readonly string[]).includes(itemType)) {
    throw new KanbanBacklogValidationError(
      "Only bug, task, or user_story can be released to the Kanban flow in v1.",
    )
  }
}

export function isKanbanBacklogListRow(item: {
  kanbanColumnPublicId: string | null
  parentItemPublicId: string | null
}): boolean {
  return item.kanbanColumnPublicId === null && item.parentItemPublicId === null
}

/** Backlog o ya liberado al tablero: mismo ítem, distinto `kanbanColumnPublicId`. Excluye sub-ítems bajo un padre. */
export function isKanbanTopLevelWorkItem(item: { parentItemPublicId: string | null }): boolean {
  return item.parentItemPublicId === null
}
