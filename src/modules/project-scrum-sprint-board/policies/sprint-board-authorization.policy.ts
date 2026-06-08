import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { SprintBoardForbiddenError } from "../domain/sprint-board.errors.js"

/**
 * Lectura del board (sprint activo o cerrado), métricas básicas, review/retro GET.
 * Familia ampliada: + `scrum_developer`, `auditor`, `scrum_coach` (solo lectura).
 */
export function assertCanReadSprintBoard(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new SprintBoardForbiddenError("Deactivated members cannot access the sprint board.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (ar === "auditor") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer" ||
    mr === "scrum_coach"
  ) {
    return
  }

  throw new SprintBoardForbiddenError(
    "Only admin, operator, auditor, agility_lead, scrum_master, product_owner, scrum_developer, or scrum_coach may view the sprint board.",
  )
}

/**
 * Iniciar sprint y mover columnas: sin ampliación a developer / auditor / coach.
 */
export function assertCanMutateSprintBoard(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new SprintBoardForbiddenError("Deactivated members cannot change the sprint board.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner"
  ) {
    return
  }

  throw new SprintBoardForbiddenError(
    "Only admin, operator, agility_lead, scrum_master, or product_owner may start the sprint or move board items.",
  )
}
