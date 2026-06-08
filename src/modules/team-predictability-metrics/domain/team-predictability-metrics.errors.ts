export const TEAM_PREDICTABILITY_METRICS_FORBIDDEN = "TEAM_PREDICTABILITY_METRICS_FORBIDDEN" as const
export const TEAM_PREDICTABILITY_METRICS_NOT_FOUND = "TEAM_PREDICTABILITY_METRICS_NOT_FOUND" as const

export class TeamPredictabilityMetricsForbiddenError extends Error {
  readonly code = TEAM_PREDICTABILITY_METRICS_FORBIDDEN
  constructor(message: string) {
    super(message)
    this.name = "TeamPredictabilityMetricsForbiddenError"
  }
}

export class TeamPredictabilityMetricsNotFoundError extends Error {
  readonly code = TEAM_PREDICTABILITY_METRICS_NOT_FOUND
  constructor() {
    super("Team or workspace context not found for predictability metrics.")
    this.name = "TeamPredictabilityMetricsNotFoundError"
  }
}
