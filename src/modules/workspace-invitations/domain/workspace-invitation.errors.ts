export class WorkspaceInvitationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "WorkspaceInvitationError"
    this.code = code
  }
}
