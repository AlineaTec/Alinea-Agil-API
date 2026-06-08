import type { ZodError } from "zod"

/** Errores HTTP del cierre de sprint (MVP). */
export class SprintClosureNotFoundError extends Error {
  readonly code = "sprint_closure_not_found" as const
  constructor(message = "Sprint not found.") {
    super(message)
    this.name = "SprintClosureNotFoundError"
  }
}

export class SprintClosureValidationError extends Error {
  readonly code = "sprint_closure_validation" as const
  constructor(
    message: string,
    readonly zodIssues?: ReturnType<ZodError["flatten"]>,
  ) {
    super(message)
    this.name = "SprintClosureValidationError"
  }
}
