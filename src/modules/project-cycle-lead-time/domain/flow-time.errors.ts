export class FlowTimeForbiddenError extends Error {
  readonly code = "flow_time_forbidden"

  constructor(message = "Not allowed to read flow time metrics.") {
    super(message)
    this.name = "FlowTimeForbiddenError"
  }
}

export class FlowTimeValidationError extends Error {
  readonly code = "flow_time_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "FlowTimeValidationError"
  }
}

/** Proyecto operativo con enfoque distinto de Kanban (p. ej. Scrum) — v1 no soportado. */
export class FlowTimeScrumNotSupportedError extends Error {
  readonly code = "scrum_not_supported"

  constructor(message = "Flow time (lead & cycle) is only available for Kanban projects in v1.") {
    super(message)
    this.name = "FlowTimeScrumNotSupportedError"
  }
}
