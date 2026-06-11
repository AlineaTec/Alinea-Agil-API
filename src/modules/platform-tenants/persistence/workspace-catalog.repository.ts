import type { WorkspaceModality } from "../../registro-onboarding/domain/workspace-modality.js"

export type WorkspaceCatalogRow = {
  workspacePublicId: string
  code: string
  displayName: string
  modality: WorkspaceModality
  billingCadence?: "monthly"
  createdAt: Date
  updatedAt: Date
}

export interface WorkspaceCatalogRepository {
  listAll(search?: string): Promise<WorkspaceCatalogRow[]>
  findByPublicId(workspacePublicId: string): Promise<WorkspaceCatalogRow | null>
}
