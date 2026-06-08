export class PlatformAuditReadForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformAuditReadForbiddenError"
  }
}

export class PlatformAuditReadNotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformAuditReadNotFoundError"
  }
}

export class PlatformAuditReadValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformAuditReadValidationError"
  }
}
