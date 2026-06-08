import type { WorkspaceModality } from "../../domain/workspace-modality.js"

/**
 * Workspace persistido tras provisioning (identidad mínima; multi-tenant complejo **[P]**).
 */
export interface WorkspaceRecordDocProps {
  workspacePublicId: string
  /** Código único (slug), alineado al normalizado del intento / Fase D. */
  code: string
  displayName: string
  /** Persistido; puede ser legado `empresa`. */
  modality: WorkspaceModality | "empresa"
  /** Modalidad de facturación elegida en alta (si aplica). */
  billingCadence?: "monthly" | "annual"
  sourceRegistrationIntentPublicId: string
}
