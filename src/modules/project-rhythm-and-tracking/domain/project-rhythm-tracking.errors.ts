export class ProjectRhythmTrackingNotFoundError extends Error {
  readonly code = "project_rhythm_tracking_not_found" as const

  constructor(message = "Operational project not found for rhythm tracking.") {
    super(message)
    this.name = "ProjectRhythmTrackingNotFoundError"
  }
}

export class ProjectRhythmTrackingForbiddenError extends Error {
  readonly code = "project_rhythm_tracking_forbidden" as const

  constructor(message = "Not allowed to read project rhythm tracking.") {
    super(message)
    this.name = "ProjectRhythmTrackingForbiddenError"
  }
}
