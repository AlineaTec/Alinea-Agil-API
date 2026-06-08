export class WorkspaceUserInvariantError extends Error {
  readonly code = "workspace_user_invariant"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceUserInvariantError"
  }
}

/** Conflicto de negocio (409): último admin, email duplicado, segundo admin, etc. */
export class WorkspaceUserConflictError extends Error {
  readonly code = "workspace_user_conflict"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceUserConflictError"
  }
}
