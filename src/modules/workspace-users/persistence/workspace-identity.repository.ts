import type { WorkspaceModality } from "../../registro-onboarding/domain/workspace-modality.js"

/**
 * Lectura mínima del documento `Workspace` (colección de registro / provisioning).
 */
export type WorkspaceIdentitySnapshot = {
  workspacePublicId: string
  code: string
  displayName: string
  modality: WorkspaceModality | "empresa"
  sourceRegistrationIntentPublicId: string
}

export interface WorkspaceIdentityRepository {
  findByWorkspacePublicId(
    workspacePublicId: string,
  ): Promise<WorkspaceIdentitySnapshot | null>
}
