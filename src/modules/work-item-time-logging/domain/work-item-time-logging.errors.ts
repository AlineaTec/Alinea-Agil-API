export class WorkItemTimeEntriesForbiddenError extends Error {
  override readonly name = "WorkItemTimeEntriesForbiddenError"
  readonly code = "time_entries_forbidden"
  constructor(message: string) {
    super(message)
  }
}

export class WorkItemTimeEntriesNotFoundError extends Error {
  override readonly name = "WorkItemTimeEntriesNotFoundError"
  readonly code = "time_entries_not_found"
  constructor(message = "Time entry not found.") {
    super(message)
  }
}

export class WorkItemTimeEntriesValidationError extends Error {
  override readonly name = "WorkItemTimeEntriesValidationError"
  readonly code = "time_entries_validation"
  constructor(message: string) {
    super(message)
  }
}
