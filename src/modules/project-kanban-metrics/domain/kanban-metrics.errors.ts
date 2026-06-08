export class KanbanMetricsForbiddenError extends Error {
  readonly code = "kanban_metrics_forbidden"

  constructor(message = "Not allowed to read Kanban metrics.") {
    super(message)
    this.name = "KanbanMetricsForbiddenError"
  }
}

export class KanbanMetricsValidationError extends Error {
  readonly code = "kanban_metrics_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "KanbanMetricsValidationError"
  }
}
