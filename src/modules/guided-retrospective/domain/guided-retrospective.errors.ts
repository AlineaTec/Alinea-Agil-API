export class GuidedRetrospectiveError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "GuidedRetrospectiveError"
  }
}

export class GuidedRetrospectiveNotFoundError extends GuidedRetrospectiveError {
  constructor(message: string) {
    super("guided_retrospective_not_found", message)
    this.name = "GuidedRetrospectiveNotFoundError"
  }
}

export class GuidedRetrospectiveValidationError extends GuidedRetrospectiveError {
  constructor(message: string) {
    super("guided_retrospective_validation", message)
    this.name = "GuidedRetrospectiveValidationError"
  }
}

export class GuidedRetrospectiveConflictError extends GuidedRetrospectiveError {
  constructor(message: string) {
    super("guided_retrospective_conflict", message)
    this.name = "GuidedRetrospectiveConflictError"
  }
}

export class GuidedRetrospectiveForbiddenError extends GuidedRetrospectiveError {
  constructor(message: string) {
    super("guided_retrospective_forbidden", message)
    this.name = "GuidedRetrospectiveForbiddenError"
  }
}

export class GuidedRetrospectiveUnsupportedError extends GuidedRetrospectiveError {
  constructor(message: string) {
    super("guided_retrospective_unsupported", message)
    this.name = "GuidedRetrospectiveUnsupportedError"
  }
}
