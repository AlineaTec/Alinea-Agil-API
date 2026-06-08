export const TEAM_FLOW_DELIVERY_ERROR_CODES = {
  FORBIDDEN: "TEAM_FLOW_DELIVERY_FORBIDDEN",
  NOT_FOUND: "TEAM_FLOW_DELIVERY_NOT_FOUND",
} as const

export class TeamFlowDeliveryMetricsForbiddenError extends Error {
  readonly code = TEAM_FLOW_DELIVERY_ERROR_CODES.FORBIDDEN
  constructor(message: string) {
    super(message)
    this.name = "TeamFlowDeliveryMetricsForbiddenError"
  }
}

export class TeamFlowDeliveryMetricsNotFoundError extends Error {
  readonly code = TEAM_FLOW_DELIVERY_ERROR_CODES.NOT_FOUND
  constructor() {
    super("Work team not found in this workspace.")
    this.name = "TeamFlowDeliveryMetricsNotFoundError"
  }
}
