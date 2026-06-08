export class WorkControlsNotFoundError extends Error {
  readonly code = "work_controls_not_found" as const
  constructor(message = "Work controls resource not found.") {
    super(message)
    this.name = "WorkControlsNotFoundError"
  }
}

export class WorkControlsForbiddenError extends Error {
  readonly code = "work_controls_forbidden" as const
  constructor(
    message: string,
    public readonly workControlsCode: string = "work_controls_forbidden",
  ) {
    super(message)
    this.name = "WorkControlsForbiddenError"
  }
}

/** Transición no permitida por reglas en modo blocking (sin override / override inválido). → HTTP 409 */
export class WorkControlsBlockedError extends Error {
  readonly code = "work_controls_blocked" as const
  constructor(
    message: string,
    public readonly payload: {
      eventCode: string
      workItemPublicId: string
      effectiveOutcome: "block"
      failedRuleIds: string[]
    },
  ) {
    super(message)
    this.name = "WorkControlsBlockedError"
  }
}

export class WorkControlsValidationError extends Error {
  readonly code = "work_controls_validation" as const
  constructor(message: string) {
    super(message)
    this.name = "WorkControlsValidationError"
  }
}
