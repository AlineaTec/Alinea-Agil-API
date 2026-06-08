export class SprintRetrospectiveNotFoundError extends Error {
  readonly code = "not_found" as const

  constructor(message = "Sprint not found.") {
    super(message)
    this.name = "SprintRetrospectiveNotFoundError"
  }
}

export class SprintRetrospectiveValidationError extends Error {
  readonly code = "sprint_retrospective_validation_error" as const
  readonly zodIssues?: ReturnType<import("zod").ZodError["flatten"]>

  constructor(message: string, zodIssues?: ReturnType<import("zod").ZodError["flatten"]>) {
    super(message)
    this.name = "SprintRetrospectiveValidationError"
    if (zodIssues) this.zodIssues = zodIssues
  }
}

export class SprintRetrospectiveConflictError extends Error {
  readonly code = "sprint_retrospective_already_exists" as const

  constructor(
    message = "A sprint retrospective already exists for this sprint. Use PATCH to update it.",
  ) {
    super(message)
    this.name = "SprintRetrospectiveConflictError"
  }
}
