export class KanbanBacklogForbiddenError extends Error {
  readonly code = "kanban_backlog_forbidden"

  constructor(message = "Not allowed to access the Kanban backlog.") {
    super(message)
    this.name = "KanbanBacklogForbiddenError"
  }
}

export class KanbanBacklogNotFoundError extends Error {
  readonly code = "kanban_backlog_not_found"

  constructor(message = "Kanban backlog item not found.") {
    super(message)
    this.name = "KanbanBacklogNotFoundError"
  }
}

export class KanbanBacklogValidationError extends Error {
  readonly code = "kanban_backlog_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "KanbanBacklogValidationError"
  }
}

