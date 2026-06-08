export class SprintBoardNotFoundError extends Error {
  readonly code = "sprint_board_not_found"

  constructor(message = "Resource not found.") {
    super(message)
    this.name = "SprintBoardNotFoundError"
  }
}

export class SprintBoardValidationError extends Error {
  readonly code = "sprint_board_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "SprintBoardValidationError"
  }
}

export class SprintBoardForbiddenError extends Error {
  readonly code = "sprint_board_forbidden"

  constructor(message: string) {
    super(message)
    this.name = "SprintBoardForbiddenError"
  }
}
