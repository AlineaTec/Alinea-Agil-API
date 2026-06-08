export class DailyAlignmentForbiddenError extends Error {
  readonly code = "daily_alignment_forbidden" as const
  constructor(message: string) {
    super(message)
    this.name = "DailyAlignmentForbiddenError"
  }
}

export class DailyAlignmentNotFoundError extends Error {
  readonly code = "daily_alignment_not_found" as const
  constructor(message: string) {
    super(message)
    this.name = "DailyAlignmentNotFoundError"
  }
}

export class DailyAlignmentConflictError extends Error {
  readonly code = "daily_alignment_conflict" as const
  constructor(message: string) {
    super(message)
    this.name = "DailyAlignmentConflictError"
  }
}

export class DailyAlignmentValidationError extends Error {
  readonly code = "daily_alignment_validation" as const
  constructor(message: string) {
    super(message)
    this.name = "DailyAlignmentValidationError"
  }
}

export class DailyAlignmentUnsupportedError extends Error {
  readonly code = "daily_alignment_unsupported" as const
  constructor(message: string) {
    super(message)
    this.name = "DailyAlignmentUnsupportedError"
  }
}
