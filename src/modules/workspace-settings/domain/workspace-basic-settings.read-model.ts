import type { WorkspaceModality } from "../../registro-onboarding/domain/workspace-modality.js"

/**
 * Vista de configuración básica del workspace (display name, código, modality).
 * Origen: tabla `workspaces` vía repositorio de workspace.
 */
export type WorkspaceBasicSettingsReadModel = {
  workspacePublicId: string
  workspaceDisplayName: string
  workspaceCode: string
  modality: WorkspaceModality
  /** ISO 8601 desde columnas de auditoría. */
  createdAt: string
  updatedAt: string
}
