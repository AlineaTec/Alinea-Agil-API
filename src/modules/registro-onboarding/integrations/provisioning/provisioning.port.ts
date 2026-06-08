import type { CommercialPlanTier } from "../../../commercial-pricing/commercial-pricing.constants.js"
import type { WorkspaceModality } from "../../domain/workspace-modality.js"

/**
 * Datos mínimos para materializar cuenta + workspace tras pago confirmado.
 * La operación HTTP valida el intento; el puerto asume datos ya coherentes.
 */
export type PaidRegistrationProvisionPayload = {
  intentPublicId: string
  emailNormalized: string
  accountFullName: string
  passwordHash: string
  modality: WorkspaceModality
  billingCadence: "monthly" | "annual"
  /** Tier comercial Gratis / Equipo / Pro cuando aplica. */
  planTier?: CommercialPlanTier
  /** Asientos contratados Team (si aplica); Individual sin uso. */
  teamSeatsPurchased?: number
  workspaceDisplayName: string
  workspaceCode: string
  /** Para fusionar `metadata.activation` sin perder claves previas del intento. */
  priorMetadata?: Record<string, unknown>
}

export type PaidRegistrationProvisionResult = {
  userPublicId: string
  workspacePublicId: string
  membershipPublicId: string
  membershipRole: "owner"
}

/**
 * Puerto: aprovisionamiento post-pago (REG-PROV). Separado de la fase de pago.
 * Implementación: `PostgresRegistrationProvisioning` (persistencia real mínima).
 */
export interface RegistrationProvisioningPort {
  provisionPaidRegistration(
    payload: PaidRegistrationProvisionPayload,
  ): Promise<PaidRegistrationProvisionResult>
}

/** Para tests aislados o tests aislados. */
export class NoopRegistrationProvisioning implements RegistrationProvisioningPort {
  async provisionPaidRegistration(
    payload: PaidRegistrationProvisionPayload,
  ): Promise<PaidRegistrationProvisionResult> {
    return {
      userPublicId: `noop-user-${payload.intentPublicId.slice(0, 8)}`,
      workspacePublicId: `noop-ws-${payload.intentPublicId.slice(0, 8)}`,
      membershipPublicId: `noop-m-${payload.intentPublicId.slice(0, 8)}`,
      membershipRole: "owner",
    }
  }
}
