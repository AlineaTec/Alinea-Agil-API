export class PlatformBillingNotFoundError extends Error {
  readonly code = "NOT_FOUND"
  constructor(message: string) {
    super(message)
    this.name = "PlatformBillingNotFoundError"
  }
}
