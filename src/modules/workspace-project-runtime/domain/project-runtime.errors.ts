export class ProjectRuntimeNotFoundError extends Error {
  readonly code = "project_runtime_not_found"

  constructor(message = "Operational project not found.") {
    super(message)
    this.name = "ProjectRuntimeNotFoundError"
  }
}

export class ProjectRuntimeForbiddenError extends Error {
  readonly code = "project_runtime_forbidden"

  constructor(message = "Not allowed to access this operational project.") {
    super(message)
    this.name = "ProjectRuntimeForbiddenError"
  }
}

export class ProjectRuntimeInvalidInputError extends Error {
  readonly code = "project_runtime_invalid_input"

  constructor(message: string) {
    super(message)
    this.name = "ProjectRuntimeInvalidInputError"
  }
}
