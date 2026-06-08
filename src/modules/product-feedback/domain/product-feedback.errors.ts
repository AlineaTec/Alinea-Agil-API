export class ProductFeedbackError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = "ProductFeedbackError"
  }
}

export class ProductFeedbackValidationError extends ProductFeedbackError {
  constructor(code: string, message: string, httpStatus = 400) {
    super(code, message, httpStatus)
    this.name = "ProductFeedbackValidationError"
  }
}

export class ProductFeedbackNotFoundError extends ProductFeedbackError {
  constructor(message = "Envío no encontrado.") {
    super("submission_not_found", message, 404)
    this.name = "ProductFeedbackNotFoundError"
  }
}

export class ProductFeedbackIdeaNotFoundError extends ProductFeedbackError {
  constructor(message = "Idea de producto no encontrada o no disponible.") {
    super("idea_not_found", message, 404)
    this.name = "ProductFeedbackIdeaNotFoundError"
  }
}

export class ProductFeedbackConflictError extends ProductFeedbackError {
  constructor(
    code: string,
    message: string,
    httpStatus = 409,
  ) {
    super(code, message, httpStatus)
    this.name = "ProductFeedbackConflictError"
  }
}

export class ProductFeedbackForbiddenError extends ProductFeedbackError {
  constructor(code: string, message: string) {
    super(code, message, 403)
    this.name = "ProductFeedbackForbiddenError"
  }
}

export function isProductFeedbackError(e: unknown): e is ProductFeedbackError {
  return e instanceof ProductFeedbackError
}
