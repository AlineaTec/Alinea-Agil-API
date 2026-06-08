export class PlatformIdentityRegistrationIntentsReadForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformIdentityRegistrationIntentsReadForbiddenError"
  }
}

export class PlatformIdentityRegistrationIntentsMutationForbiddenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PlatformIdentityRegistrationIntentsMutationForbiddenError"
  }
}

export class PlatformIdentityRegistrationIntentsDeletionBlockedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly blockedIntentPublicIds: string[],
  ) {
    super(message)
    this.name = "PlatformIdentityRegistrationIntentsDeletionBlockedError"
  }
}
