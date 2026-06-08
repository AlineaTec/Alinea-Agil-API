import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { BoardColumnItemMovementForbiddenError } from "../domain/board-column-item-movement.errors.js"

/**
 * `board-item-move.execute` / `board-item-reorder.execute` (v1: misma matriz efectiva que Kanban `board.move`).
 * Incluye `scrum_developer`; excluye `auditor` y `scrum_coach`.
 */
export function assertCanExecuteBoardItemMove(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new BoardColumnItemMovementForbiddenError("Deactivated members cannot move board items.")
  }
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }
  throw new BoardColumnItemMovementForbiddenError(
    "Only admin, operator, agility_lead, scrum_master, product_owner, or scrum_developer may move items on the board.",
  )
}

export const assertCanExecuteBoardItemReorder = assertCanExecuteBoardItemMove
