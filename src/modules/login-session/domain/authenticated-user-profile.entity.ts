import type { WorkspaceModality } from "../../registro-onboarding/domain/workspace-modality.js"

/**
 * Identidad pública del usuario autenticado (sin credenciales).
 */
export type AuthenticatedUserProfile = {
  userPublicId: string
  emailNormalized: string
  fullName: string
  modalityAtSignup: WorkspaceModality
}
