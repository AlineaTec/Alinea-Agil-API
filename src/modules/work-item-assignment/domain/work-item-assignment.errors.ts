export class WorkItemAssignmentForbiddenError extends Error {
  readonly code = "work_item_assignment_forbidden"

  constructor(message = "Not allowed to access or change work item assignment.") {
    super(message)
    this.name = "WorkItemAssignmentForbiddenError"
  }
}

export class WorkItemAssignmentNotFoundError extends Error {
  readonly code = "work_item_assignment_item_not_found"

  constructor(message = "Backlog item not found.") {
    super(message)
    this.name = "WorkItemAssignmentNotFoundError"
  }
}

export class WorkItemAssignmentValidationError extends Error {
  readonly code = "work_item_assignment_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "WorkItemAssignmentValidationError"
  }
}

/**
 * Conflicto de negocio (p. ej. autoasignación cuando ya hay otro responsable).
 */
export class WorkItemAssignmentConflictError extends Error {
  readonly code = "work_item_assignment_conflict"

  constructor(message: string) {
    super(message)
    this.name = "WorkItemAssignmentConflictError"
  }
}
