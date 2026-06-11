import type { IdentityRegistrationIntentStatus } from "../../domain/registration-status.js"
import type { WorkspaceModality } from "../../domain/workspace-modality.js"

/**
 * Registro persistido — intento de registro.
 * TODO [P]: índice TTL en `expiresAt`.
 * TODO [P]: unicidad / límites por `emailNormalized` según open-questions.md.
 */
export interface IdentityRegistrationIntentDocProps {
  intentPublicId: string
  emailNormalized: string
  status: IdentityRegistrationIntentStatus
  /** Persistido; puede ser legado `empresa`. */
  modality?: WorkspaceModality | "empresa"
  workspaceDisplayName?: string
  workspaceCode?: string
  accountFullName?: string
  passwordHash?: string
  /** Tras provisioning exitoso (fase posterior al pago). */
  provisionedUserPublicId?: string
  provisionedWorkspacePublicId?: string
  provisionedAt?: Date
  planSku?: string
  billingCadence?: "monthly"
  /** Asientos contratados para Team (mín. 3 en facturación); Individual ignora. */
  teamSeatsPurchased?: number
  paymentProviderRef?: string
  metadata?: Record<string, unknown>
  expiresAt: Date
}
