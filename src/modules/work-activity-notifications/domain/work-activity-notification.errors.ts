export class WorkActivityNotificationNotFoundError extends Error {
  readonly code = "notification_not_found" as const
  constructor(message = "Notification not found.") {
    super(message)
    this.name = "WorkActivityNotificationNotFoundError"
  }
}

export class WorkActivityNotificationForbiddenError extends Error {
  readonly code = "notification_forbidden" as const
  constructor(message = "You cannot access this notification.") {
    super(message)
    this.name = "WorkActivityNotificationForbiddenError"
  }
}

export class WorkActivityNotificationValidationError extends Error {
  readonly code = "notification_invalid_filter" as const
  constructor(message: string) {
    super(message)
    this.name = "WorkActivityNotificationValidationError"
  }
}
