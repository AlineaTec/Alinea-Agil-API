export class TeamOperationalMetricsForbiddenError extends Error {
  readonly code = "TOM_FORBIDDEN" as const
  constructor(message: string) {
    super(message)
    this.name = "TeamOperationalMetricsForbiddenError"
  }
}

export class TeamOperationalMetricsNotFoundError extends Error {
  readonly code = "TOM_NOT_FOUND" as const
  constructor(message = "Work team not found in this workspace.") {
    super(message)
    this.name = "TeamOperationalMetricsNotFoundError"
  }
}
