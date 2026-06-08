export class ProductIdeaFeedbackEntryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = "ProductIdeaFeedbackEntryError"
  }
}

export class ProductIdeaFeedbackEntryValidationError extends ProductIdeaFeedbackEntryError {
  constructor(code: string, message: string) {
    super(code, message, 400)
    this.name = "ProductIdeaFeedbackEntryValidationError"
  }
}

export class ProductIdeaFeedbackEntryNotFoundError extends ProductIdeaFeedbackEntryError {
  constructor(message = "Recurso no encontrado.") {
    super("not_found", message, 404)
    this.name = "ProductIdeaFeedbackEntryNotFoundError"
  }
}

export class ProductIdeaFeedbackEntryForbiddenError extends ProductIdeaFeedbackEntryError {
  constructor(
    public readonly code: string = "forbidden",
    message = "No autorizado.",
  ) {
    super(code, message, 403)
    this.name = "ProductIdeaFeedbackEntryForbiddenError"
  }
}

export class ProductIdeaFeedbackEntryConflictError extends ProductIdeaFeedbackEntryError {
  constructor(
    public readonly code: string = "ALREADY_SUBMITTED",
    message = "Ya enviaste feedback para esta idea.",
  ) {
    super(code, message, 409)
    this.name = "ProductIdeaFeedbackEntryConflictError"
  }
}
