import { OPERATIONAL_APPROACHES } from "../../domain/operational-approach.js"
import { OPERATIONAL_PROJECT_STATUSES } from "../../domain/operational-project-status.js"

export interface WorkspaceRuntimeProjectDocProps {
  projectPublicId: string
  workspacePublicId: string
  sourceDraftPublicId: string
  projectName: string
  operationalApproach: (typeof OPERATIONAL_APPROACHES)[number]
  initialConfigurationSummary: Record<string, unknown>
  status: (typeof OPERATIONAL_PROJECT_STATUSES)[number]
  materializedAt: Date
  createdAt: Date
  updatedAt: Date
}
