export class OperatingSnapshotNotFoundError extends Error {
  readonly code = "operating_snapshot_project_not_found" as const

  constructor(message = "Project not found.") {
    super(message)
    this.name = "OperatingSnapshotNotFoundError"
  }
}

export class OperatingSnapshotForbiddenError extends Error {
  readonly code = "operating_snapshot_forbidden" as const

  constructor(message = "You do not have access to this project.") {
    super(message)
    this.name = "OperatingSnapshotForbiddenError"
  }
}

export class OperatingSnapshotValidationError extends Error {
  readonly code = "operating_snapshot_validation_error" as const

  constructor(message: string) {
    super(message)
    this.name = "OperatingSnapshotValidationError"
  }
}

export class OperatingSnapshotConflictError extends Error {
  readonly code = "operating_snapshot_conflict" as const

  constructor(message: string) {
    super(message)
    this.name = "OperatingSnapshotConflictError"
  }
}
