export class SprintReviewNotFoundError extends Error {
  readonly code = "not_found" as const

  constructor(message = "Sprint not found.") {
    super(message)
    this.name = "SprintReviewNotFoundError"
  }
}

export class SprintReviewValidationError extends Error {
  readonly code = "sprint_review_validation_error" as const
  readonly zodIssues?: ReturnType<import("zod").ZodError["flatten"]>

  constructor(message: string, zodIssues?: ReturnType<import("zod").ZodError["flatten"]>) {
    super(message)
    this.name = "SprintReviewValidationError"
    if (zodIssues) this.zodIssues = zodIssues
  }
}

/** Intento de POST cuando ya existe review (unicidad 1:1 por sprint). */
export class SprintReviewConflictError extends Error {
  readonly code = "sprint_review_already_exists" as const

  constructor(message = "A sprint review already exists for this sprint. Use PATCH to update it.") {
    super(message)
    this.name = "SprintReviewConflictError"
  }
}
