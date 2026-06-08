/** Error de negocio HTTP 400 */
export class GuidedReviewValidationError extends Error {
  readonly code = "guided_review_validation"
  constructor(message: string) {
    super(message)
    this.name = "GuidedReviewValidationError"
  }
}

/** 404 recurso no encontrado */
export class GuidedReviewNotFoundError extends Error {
  readonly code = "guided_review_not_found"
  constructor(message: string) {
    super(message)
    this.name = "GuidedReviewNotFoundError"
  }
}

/** 403 permisos */
export class GuidedReviewForbiddenError extends Error {
  readonly code = "guided_review_forbidden"
  constructor(message: string) {
    super(message)
    this.name = "GuidedReviewForbiddenError"
  }
}

/** 409 conflicto de estado */
export class GuidedReviewConflictError extends Error {
  readonly code = "guided_review_conflict"
  constructor(message: string) {
    super(message)
    this.name = "GuidedReviewConflictError"
  }
}

/** Enfoque no operable (predictive v1) */
export class GuidedReviewUnsupportedError extends Error {
  readonly code = "guided_review_unsupported"
  constructor(message: string) {
    super(message)
    this.name = "GuidedReviewUnsupportedError"
  }
}
