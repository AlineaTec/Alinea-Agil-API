export class PlatformTenantForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformTenantForbiddenError"
  }
}

export class PlatformTenantNotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformTenantNotFoundError"
  }
}

export class PlatformTenantValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformTenantValidationError"
  }
}
