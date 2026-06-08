import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  kanbanMemberHasBoardBlock,
  kanbanMemberHasBoardMove,
  kanbanMemberHasBoardRead,
  kanbanMemberHasBoardReturnToBacklog,
} from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"
import { KanbanBoardForbiddenError } from "../domain/kanban-board.errors.js"

function assertActiveForBoard(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new KanbanBoardForbiddenError("Deactivated members cannot access the Kanban board.")
  }
}

/** `kanban.board.read` */
export function assertCanReadKanbanBoard(actor: WorkspaceMemberState): void {
  assertActiveForBoard(actor)
  if (!kanbanMemberHasBoardRead(actor)) {
    throw new KanbanBoardForbiddenError(
      "Only admin, operator, auditor, agility_lead, scrum_master, product_owner, scrum_developer, or scrum_coach may view the Kanban board.",
    )
  }
}

/** `kanban.board.move` */
export function assertCanMoveKanbanBoardItem(actor: WorkspaceMemberState): void {
  assertActiveForBoard(actor)
  if (!kanbanMemberHasBoardMove(actor)) {
    throw new KanbanBoardForbiddenError(
      "Only admin, operator, agility_lead, scrum_master, product_owner, or scrum_developer may move items on the Kanban board.",
    )
  }
}

/** Alias explícito de `kanban.board.move` (plural). */
export const assertCanMoveKanbanBoardItems = assertCanMoveKanbanBoardItem

/** `kanban.board.block` (v1: misma matriz efectiva que move). */
export function assertCanBlockKanbanBoardItems(actor: WorkspaceMemberState): void {
  assertActiveForBoard(actor)
  if (!kanbanMemberHasBoardBlock(actor)) {
    throw new KanbanBoardForbiddenError(
      "Only admin, operator, agility_lead, scrum_master, product_owner, or scrum_developer may block or unblock Kanban board items.",
    )
  }
}

/** `kanban.board.return_to_backlog` (frontera alineada a liberar — PKP-05). */
export function assertCanReturnKanbanBoardItemsToBacklog(actor: WorkspaceMemberState): void {
  assertActiveForBoard(actor)
  if (!kanbanMemberHasBoardReturnToBacklog(actor)) {
    throw new KanbanBoardForbiddenError(
      "Only admin, operator, agility_lead, product_owner, or scrum_master may return Kanban board items to the backlog.",
    )
  }
}
