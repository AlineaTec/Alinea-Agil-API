import { assertCanMoveKanbanBoardItem } from "../../project-kanban-board/policies/kanban-board-authorization.policy.js"
import { assertCanReadKanbanBoard } from "../../project-kanban-board/policies/kanban-board-authorization.policy.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"
import {
  assertCanMutateSprintBoard,
  assertCanReadSprintBoard,
} from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ImpedimentForbiddenError } from "../domain/impediment.errors.js"

function tryReadScrumBacklog(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadScrumBacklog(actor)
    return true
  } catch {
    return false
  }
}

function tryReadSprintBoard(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadSprintBoard(actor)
    return true
  } catch {
    return false
  }
}

function tryReadKanbanBoard(actor: WorkspaceMemberState): boolean {
  try {
    assertCanReadKanbanBoard(actor)
    return true
  } catch {
    return false
  }
}

/**
 * Lectura de impedimentos: unión de quien puede leer backlog Scrum, board de sprint o tablero Kanban
 * (misma idea que work-item-comments: acceso operativo al proyecto sin listado workspace-wide).
 */
export function assertCanReadProjectImpediments(actor: WorkspaceMemberState): void {
  if (tryReadScrumBacklog(actor) || tryReadSprintBoard(actor) || tryReadKanbanBoard(actor)) {
    return
  }
  throw new ImpedimentForbiddenError(
    "You do not have permission to read impediments for this project.",
  )
}

/**
 * Mutación (crear, patch, asignar, resolver, descartar, reabrir).
 * Alineado a work-item-comments: excluye auditor y scrum_coach; incluye scrum_developer.
 */
export function assertCanMutateProjectImpediments(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ImpedimentForbiddenError("Deactivated members cannot change impediments.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "auditor") {
    throw new ImpedimentForbiddenError("Auditor role is read-only for impediments.")
  }

  if (mr === "scrum_coach") {
    throw new ImpedimentForbiddenError("Scrum coach role is read-only for impediments.")
  }

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }

  throw new ImpedimentForbiddenError("You do not have permission to change impediments in this project.")
}

/**
 * Borrar comentario ajeno en un impedimento: moderación en Scrum (tablero sprint) o Kanban (mover/bloquear).
 */
export function assertCanModerateProjectImpedimentComments(actor: WorkspaceMemberState): void {
  try {
    assertCanMutateSprintBoard(actor)
    return
  } catch {
    /* try Kanban */
  }
  try {
    assertCanMoveKanbanBoardItem(actor)
    return
  } catch {
    /* fall through */
  }
  throw new ImpedimentForbiddenError(
    "You do not have permission to moderate impediment comments for this project.",
  )
}
