export class TransactionalEmailMisconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionalEmailMisconfiguredError"
  }
}

export class TransactionalEmailInvalidRecipientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionalEmailInvalidRecipientError"
  }
}
