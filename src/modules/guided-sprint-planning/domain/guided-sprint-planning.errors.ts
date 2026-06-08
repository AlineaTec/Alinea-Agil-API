export class GuidedSprintPlanningForbiddenError extends Error {
  readonly code = "guided_sprint_planning_forbidden" as const

  constructor(message: string) {
    super(message)
    this.name = "GuidedSprintPlanningForbiddenError"
  }
}

export class GuidedSprintPlanningNotFoundError extends Error {
  readonly code = "guided_sprint_planning_not_found" as const

  constructor(message: string) {
    super(message)
    this.name = "GuidedSprintPlanningNotFoundError"
  }
}

export class GuidedSprintPlanningConflictError extends Error {
  readonly code = "guided_sprint_planning_conflict" as const

  constructor(message: string) {
    super(message)
    this.name = "GuidedSprintPlanningConflictError"
  }
}

export class GuidedSprintPlanningUnsupportedError extends Error {
  readonly code = "guided_sprint_planning_unsupported" as const

  constructor(message: string) {
    super(message)
    this.name = "GuidedSprintPlanningUnsupportedError"
  }
}

export class GuidedSprintPlanningValidationError extends Error {
  readonly code = "guided_sprint_planning_validation_error" as const

  constructor(message: string) {
    super(message)
    this.name = "GuidedSprintPlanningValidationError"
  }
}

export class GuidedSprintPlanningCommitApplyError extends Error {
  readonly code = "guided_sprint_planning_commit_apply_failed" as const

  constructor(
    message: string,
    readonly failedWorkItemPublicId: string | null = null,
  ) {
    super(message)
    this.name = "GuidedSprintPlanningCommitApplyError"
  }
}
