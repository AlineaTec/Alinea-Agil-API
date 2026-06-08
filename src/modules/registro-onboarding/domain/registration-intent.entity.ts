import type { IdentityRegistrationIntentStatus } from "./registration-status.js"
import type { WorkspaceModality } from "./workspace-modality.js"

/**
 * Entidad de dominio (props persistibles) — sin detalles de ORM.
 * Campos opcionales se van rellenando por fase; ver api-needs.md.
 *
 * TODO [P]: momento exacto de persistir credenciales; política de reserva de slug.
 */
export interface IdentityRegistrationIntent {
  /** Identificador opaco expuesto al cliente cuando exista contrato (cookie/header). */
  intentPublicId: string
  emailNormalized: string
  status: IdentityRegistrationIntentStatus
  modality?: WorkspaceModality
  /** Nombre visible del workspace (Fase D). */
  workspaceDisplayName?: string
  /** Código único tipo slug (Fase D). */
  workspaceCode?: string
  /** Titular / nombre completo (Fase E); contraseña nunca en claro. */
  accountFullName?: string
  /**
   * Hash de contraseña para el intento (Fase E) — ver `intent-password-hash.ts`.
   * Formato versionado (`v1.scrypt$…`); **no** es el mismo esquema que el login definitivo hasta activación **[P]**.
   */
  passwordHash?: string
  /** SKU / plan cuando exista catálogo (Fase C). */
  planSku?: string
  /** Mensual o anual; default mensual si no se envía (legado). */
  billingCadence?: "monthly" | "annual"
  /** Asientos contratados en Team (≥3 facturados); Individual ignora. */
  teamSeatsPurchased?: number
  /** Referencias de pago cuando exista integración (Fase F). */
  paymentProviderRef?: string
  /**
   * Tras activación (provisioning): enlaces al resultado materializado.
   * Vacío hasta `POST /activate` con éxito.
   */
  provisionedUserPublicId?: string
  provisionedWorkspacePublicId?: string
  provisionedAt?: Date
  /** Cubo mínimo para extensiones sin esquema rígido; usar con criterio. */
  metadata?: Record<string, unknown>
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export type CreateIdentityRegistrationIntentInput = Pick<
  IdentityRegistrationIntent,
  "intentPublicId" | "emailNormalized" | "status" | "expiresAt"
>

export type UpdateIdentityRegistrationIntentPatch = Partial<
  Omit<IdentityRegistrationIntent, "intentPublicId" | "createdAt" | "updatedAt">
>
