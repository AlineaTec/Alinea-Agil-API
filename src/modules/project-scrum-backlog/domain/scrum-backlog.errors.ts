export class ScrumBacklogForbiddenError extends Error {
  readonly code = "scrum_backlog_forbidden"

  constructor(message = "Not allowed to access the Scrum backlog.") {
    super(message)
    this.name = "ScrumBacklogForbiddenError"
  }
}

export class ScrumBacklogNotFoundError extends Error {
  readonly code = "scrum_backlog_not_found"

  constructor(message = "Backlog item not found.") {
    super(message)
    this.name = "ScrumBacklogNotFoundError"
  }
}

export class ScrumBacklogValidationError extends Error {
  readonly code = "scrum_backlog_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "ScrumBacklogValidationError"
  }
}
