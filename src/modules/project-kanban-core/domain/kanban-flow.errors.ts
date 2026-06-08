export class KanbanFlowValidationError extends Error {
  readonly code = "kanban_flow_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "KanbanFlowValidationError"
  }
}

export class KanbanFlowNotFoundError extends Error {
  readonly code = "kanban_flow_not_found"

  constructor(message = "Kanban flow configuration not found for this project.") {
    super(message)
    this.name = "KanbanFlowNotFoundError"
  }
}
