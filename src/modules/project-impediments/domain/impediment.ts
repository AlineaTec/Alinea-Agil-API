export type ImpedimentStatus = "open" | "in_review" | "mitigating" | "resolved" | "dismissed"

export type ImpedimentSeverity = "low" | "medium" | "high" | "critical"

export type ImpedimentState = {
  impedimentPublicId: string
  workspacePublicId: string
  projectPublicId: string
  relatedWorkItemPublicId: string | null
  relatedSprintPublicId: string | null
  title: string
  description: string
  status: ImpedimentStatus
  severity: ImpedimentSeverity
  responsibleUserPublicId: string | null
  reportedByUserPublicId: string
  detectedAt: Date
  resolvedAt: Date | null
  dismissedAt: Date | null
  resolutionSummary: string | null
  dismissalReason: string | null
  createdAt: Date
  updatedAt: Date
}

export const IMPEDIMENT_STATUSES: readonly ImpedimentStatus[] = [
  "open",
  "in_review",
  "mitigating",
  "resolved",
  "dismissed",
] as const

export const IMPEDIMENT_SEVERITIES: readonly ImpedimentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const
