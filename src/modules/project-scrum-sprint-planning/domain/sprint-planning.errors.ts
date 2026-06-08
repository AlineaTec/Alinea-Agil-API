export class SprintPlanningNotFoundError extends Error {
  readonly code = "sprint_planning_not_found"

  constructor(message = "Sprint not found.") {
    super(message)
    this.name = "SprintPlanningNotFoundError"
  }
}

export class SprintPlanningValidationError extends Error {
  readonly code = "sprint_planning_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "SprintPlanningValidationError"
  }
}
