export class WorkItemCommentsForbiddenError extends Error {
  readonly code = "work_item_comments_forbidden"
  constructor(message: string) {
    super(message)
    this.name = "WorkItemCommentsForbiddenError"
  }
}

export class WorkItemCommentsNotFoundError extends Error {
  readonly code = "work_item_comments_not_found"
  constructor(message = "Comment not found.") {
    super(message)
    this.name = "WorkItemCommentsNotFoundError"
  }
}

export class WorkItemCommentsValidationError extends Error {
  readonly code = "work_item_comments_validation"
  constructor(message: string) {
    super(message)
    this.name = "WorkItemCommentsValidationError"
  }
}
