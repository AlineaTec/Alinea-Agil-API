/** Errores HTTP del slice de métricas básicas del sprint cerrado (MVP). */
export class SprintMetricsNotFoundError extends Error {
  readonly code = "sprint_metrics_not_found" as const
  constructor(message = "Sprint not found.") {
    super(message)
    this.name = "SprintMetricsNotFoundError"
  }
}

export class SprintMetricsValidationError extends Error {
  readonly code = "sprint_metrics_validation" as const
  constructor(message: string) {
    super(message)
    this.name = "SprintMetricsValidationError"
  }
}
