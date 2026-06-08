export class WorkTeamForbiddenError extends Error {
  readonly code = "work_team_forbidden"
  constructor(message: string) {
    super(message)
    this.name = "WorkTeamForbiddenError"
  }
}

export class WorkTeamNotFoundError extends Error {
  readonly code = "work_team_not_found"
  constructor() {
    super("Work team not found.")
    this.name = "WorkTeamNotFoundError"
  }
}

export class WorkTeamValidationError extends Error {
  readonly code = "work_team_validation"
  constructor(message: string) {
    super(message)
    this.name = "WorkTeamValidationError"
  }
}

export class WorkTeamConflictError extends Error {
  readonly code = "work_team_conflict"
  constructor(message: string) {
    super(message)
    this.name = "WorkTeamConflictError"
  }
}
