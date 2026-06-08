export interface ImpedimentDocProps {
  impedimentPublicId: string
  workspacePublicId: string
  projectPublicId: string
  relatedWorkItemPublicId: string | null
  relatedSprintPublicId: string | null
  title: string
  description: string
  status: "open" | "in_review" | "mitigating" | "resolved" | "dismissed"
  severity: "low" | "medium" | "high" | "critical"
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
