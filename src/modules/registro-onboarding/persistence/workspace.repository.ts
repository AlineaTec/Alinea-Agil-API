import type { WorkspaceModality } from "../domain/workspace-modality.js"

export type WorkspaceState = {
  workspacePublicId: string
  slug: string
  displayName: string
  modality: WorkspaceModality | "empresa"
  billingCadence?: "monthly" | "annual"
  sourceRegistrationIntentPublicId: string
  createdAt: Date
  updatedAt: Date
}

export type CreateWorkspaceInput = {
  workspacePublicId: string
  slug: string
  displayName: string
  modality: WorkspaceModality | "empresa"
  billingCadence?: "monthly" | "annual"
  sourceRegistrationIntentPublicId: string
}

/**
 * Persistencia del tenant (`workspaces`).
 * Implementación Prisma: `persistence/prisma/workspace.prisma-repository.ts`.
 */
export interface WorkspaceRepository {
  create(input: CreateWorkspaceInput): Promise<WorkspaceState>
  findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceState | null>
  findBySlug(slug: string): Promise<WorkspaceState | null>
  existsBySlug(slug: string): Promise<boolean>
}
