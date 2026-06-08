export class ImpedimentForbiddenError extends Error {
  readonly code = "impediment_forbidden"
  constructor(message: string) {
    super(message)
    this.name = "ImpedimentForbiddenError"
  }
}

export class ImpedimentNotFoundError extends Error {
  readonly code = "impediment_not_found"
  constructor() {
    super("Impediment not found.")
    this.name = "ImpedimentNotFoundError"
  }
}

export class ImpedimentValidationError extends Error {
  readonly code = "impediment_validation"
  constructor(message: string) {
    super(message)
    this.name = "ImpedimentValidationError"
  }
}

export class ImpedimentConflictError extends Error {
  readonly code = "impediment_conflict"
  constructor(message: string) {
    super(message)
    this.name = "ImpedimentConflictError"
  }
}

export class ProjectImpedimentCommentNotFoundError extends Error {
  readonly code = "impediment_comment_not_found"
  constructor() {
    super("Impediment comment not found.")
    this.name = "ProjectImpedimentCommentNotFoundError"
  }
}
