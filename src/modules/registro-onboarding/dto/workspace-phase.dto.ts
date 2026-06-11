/**
 * Respuestas Fases C–D (modalidad, identidad workspace, disponibilidad de código).
 * Forma estable para futura OpenAPI / consumo `web`.
 */
import type { CommercialQuote } from "../../commercial-pricing/compute-commercial-quote.js"
import type { CommercialPlanTier } from "../../commercial-pricing/commercial-pricing.constants.js"
import type { WorkspaceModality } from "../domain/workspace-modality.js"

export type WorkspaceCodeAvailabilityResponse =
  | { available: true; codeNormalized: string }
  | {
      available: false
      reason: "invalid_format" | "reserved" | "taken"
    }

export type SetModalityResponse =
  | {
      ok: true
      intentPublicId: string
      intentStatus: "MODALITY_SELECTED"
      modality: WorkspaceModality
      billingCadence: "monthly"
      planTier?: CommercialPlanTier
      teamSeatsPurchased?: number
      /** Cotización alineada a `commercial-pricing` (fuente de verdad). */
      commercialQuote: CommercialQuote
    }
  | {
      ok: false
      reason: "intent_not_found" | "invalid_intent_state" | "intent_expired"
    }

export type SetWorkspaceIdentityResponse =
  | {
      ok: true
      intentPublicId: string
      intentStatus: "WORKSPACE_PROPOSED"
      workspaceName: string
      workspaceCode: string
    }
  | {
      ok: false
      reason:
        | "intent_not_found"
        | "invalid_intent_state"
        | "intent_expired"
        | "modality_required"
        | "invalid_workspace_name"
        | "invalid_workspace_code"
        | "code_taken"
        | "code_reserved"
    }
