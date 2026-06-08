import type { InitialConfigurationSummary } from "./initial-configuration-summary.js"
import type { OperationalApproach } from "./operational-approach.js"
import type { WorkspaceRuntimeProjectStatus } from "./operational-project-status.js"

/**
 * Agregado persistido del proyecto operativo materializado (contenedor + resumen).
 * Distinto del project draft (`workspace-projects`).
 */
export type WorkspaceRuntimeProjectState = {
  projectPublicId: string
  workspacePublicId: string
  sourceDraftPublicId: string
  projectName: string
  operationalApproach: OperationalApproach
  initialConfigurationSummary: InitialConfigurationSummary
  status: WorkspaceRuntimeProjectStatus
  materializedAt: Date
  createdAt: Date
  updatedAt: Date
}
