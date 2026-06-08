export class PlatformUserInvariantError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformUserInvariantError"
  }
}

export class PlatformUserForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformUserForbiddenError"
  }
}

export class PlatformUserConflictError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformUserConflictError"
  }
}
