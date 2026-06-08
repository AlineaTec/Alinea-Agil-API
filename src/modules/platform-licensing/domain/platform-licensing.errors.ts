export class PlatformLicensingForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformLicensingForbiddenError"
  }
}

export class PlatformLicensingNotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformLicensingNotFoundError"
  }
}
