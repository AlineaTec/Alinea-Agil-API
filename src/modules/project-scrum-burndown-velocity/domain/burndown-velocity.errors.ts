export class BurndownVelocityNotFoundError extends Error {
  readonly code = "sprint_burndown_not_found" as const
  constructor(message = "Sprint or project not found for burndown/velocity context.") {
    super(message)
    this.name = "BurndownVelocityNotFoundError"
  }
}

export class BurndownVelocityValidationError extends Error {
  readonly code = "sprint_burndown_invalid" as const
  constructor(message: string) {
    super(message)
    this.name = "BurndownVelocityValidationError"
  }
}
