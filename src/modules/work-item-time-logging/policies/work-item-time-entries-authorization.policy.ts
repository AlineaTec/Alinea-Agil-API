import { assertCanMutateSprintBoard } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  assertCanMutateOwnWorkItemComment,
  assertCanReadWorkItemComments,
} from "../../work-item-comments/policies/work-item-comments-authorization.policy.js"
import { WorkItemTimeEntriesForbiddenError } from "../domain/work-item-time-logging.errors.js"

/**
 * `time-entries.read` — paridad con comentarios de ítem: lectura de backlog o board (v1).
 * @see `assertCanReadWorkItemComments` en work-item-comments.
 */
export function assertCanReadTimeEntries(actor: WorkspaceMemberState): void {
  assertCanReadWorkItemComments(actor)
}

/**
 * `time-entries.create` — quienes pueden comentar (no auditar ni coach) según módulo de comentarios.
 */
export function assertCanCreateTimeEntry(actor: WorkspaceMemberState): void {
  assertCanMutateOwnWorkItemComment(actor)
}

/**
 * `time-entries.update-own` (si `isAuthor`); de lo contrario `time-entries.update-any`
 * (misma “moderación” que borrar comentario ajeno: `assertCanMutateSprintBoard`).
 */
export function assertCanUpdateTimeEntry(actor: WorkspaceMemberState, isAuthor: boolean): void {
  if (isAuthor) {
    assertCanMutateOwnWorkItemComment(actor)
  } else {
    assertCanMutateSprintBoard(actor)
  }
}

/**
 * `time-entries.delete-own` o `time-entries.delete-any` (misma matriz que comentarios).
 */
export function assertCanDeleteTimeEntry(actor: WorkspaceMemberState, isAuthor: boolean): void {
  if (isAuthor) {
    assertCanMutateOwnWorkItemComment(actor)
  } else {
    assertCanMutateSprintBoard(actor)
  }
}

/**
 * Comprueba `actor` vs autor de la fila. Expuesto para DTOs (`canUpdate`, etc.).
 */
export function timeEntryIsAuthoredByActor(
  createdByUserPublicId: string,
  actor: WorkspaceMemberState,
): boolean {
  return createdByUserPublicId === actor.userPublicId
}

/**
 * Asegura que el `workspacePublicId` del request coincide con el asiento del actor.
 * Evita fuga básica de IDs entre workspaces.
 */
export function assertTimeEntryRequestWorkspaceMatchesActor(
  workspacePublicId: string,
  actor: WorkspaceMemberState,
): void {
  if (actor.workspacePublicId !== workspacePublicId) {
    throw new WorkItemTimeEntriesForbiddenError("Workspace in path does not match authenticated membership.")
  }
}
