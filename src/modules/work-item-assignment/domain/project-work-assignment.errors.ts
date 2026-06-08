/**
 * Errores de dominio (prefijo `ASG_` — project-work-assignment, contracts-docs).
 * HTTP: **422** en rutas.
 */
export type ProjectWorkAssignmentErrorCode =
  | "ASG_PROJECT_HAS_NO_LINKED_TEAMS"
  | "ASG_ASSIGNEE_NOT_ELIGIBLE"
  | "ASG_WORK_ITEM_TYPE_NOT_ASSIGNABLE"
  | "ASG_REASSIGN_NOT_ALLOWED"
  | "ASG_CLEAR_NOT_ALLOWED"

export class ProjectWorkAssignmentError extends Error {
  readonly name = "ProjectWorkAssignmentError"

  constructor(
    readonly code: ProjectWorkAssignmentErrorCode,
    message: string,
  ) {
    super(message)
  }
}
