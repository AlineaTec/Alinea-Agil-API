export class ProjectDraftNotFoundError extends Error {
  readonly code = "project_draft_not_found"

  constructor(message = "Project draft not found.") {
    super(message)
    this.name = "ProjectDraftNotFoundError"
  }
}

/** 403 — permisos del actor sobre el wizard de drafts (HTTP). */
export class ProjectDraftForbiddenError extends Error {
  readonly code = "project_draft_forbidden"

  constructor(message: string) {
    super(message)
    this.name = "ProjectDraftForbiddenError"
  }
}

export class ProjectDraftInvalidTransitionError extends Error {
  readonly code = "project_draft_invalid_transition"

  constructor(
    message: string,
    readonly details?: { status: string; reason?: string },
  ) {
    super(message)
    this.name = "ProjectDraftInvalidTransitionError"
  }
}

export class ProjectDraftInvalidOperationError extends Error {
  readonly code = "project_draft_invalid_operation"

  constructor(message: string) {
    super(message)
    this.name = "ProjectDraftInvalidOperationError"
  }
}
