/** Error de negocio HTTP 400 */
export class GuidedRefinementValidationError extends Error {
  readonly code = "guided_refinement_validation"
  constructor(message: string) {
    super(message)
    this.name = "GuidedRefinementValidationError"
  }
}

/** 404 recurso no encontrado */
export class GuidedRefinementNotFoundError extends Error {
  readonly code = "guided_refinement_not_found"
  constructor(message: string) {
    super(message)
    this.name = "GuidedRefinementNotFoundError"
  }
}

/** 403 permisos */
export class GuidedRefinementForbiddenError extends Error {
  readonly code = "guided_refinement_forbidden"
  constructor(message: string) {
    super(message)
    this.name = "GuidedRefinementForbiddenError"
  }
}

/** 409 conflicto de estado */
export class GuidedRefinementConflictError extends Error {
  readonly code = "guided_refinement_conflict"
  constructor(message: string) {
    super(message)
    this.name = "GuidedRefinementConflictError"
  }
}

/** Enfoque no soportado (p. ej. predictive_phases) */
export class GuidedRefinementUnsupportedError extends Error {
  readonly code = "guided_refinement_unsupported"
  constructor(message: string) {
    super(message)
    this.name = "GuidedRefinementUnsupportedError"
  }
}
