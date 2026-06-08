export class PlatformObservabilityForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformObservabilityForbiddenError"
  }
}

export class PlatformObservabilityNotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformObservabilityNotFoundError"
  }
}
