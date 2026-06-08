import type { WorkspaceModality } from "../../domain/workspace-modality.js"

/**
 * Usuario materializado tras activación del registro (borde respecto al intento).
 * Credencial: hash copiado del intento; el módulo de login definitivo puede evolucionar formato **[P]**.
 */
export interface IdentityRegisteredUserDocProps {
  userPublicId: string
  emailNormalized: string
  fullName: string
  passwordHash: string
  modalityAtSignup: WorkspaceModality
  /** Trazabilidad: intento que originó este registro. */
  sourceRegistrationIntentPublicId: string
  /**
   * Workspace activo preferido (cuenta global, v1 WMI).
   * Validación contra membresías en lectura de sesión, validación en capa de aplicación.
   */
  preferredActiveWorkspacePublicId?: string | null
  preferredActiveWorkspaceUpdatedAt?: Date | null
}
