/**
 * Respuesta POST `/payment/simulated-confirm` (Fase F, pago simulado).
 * Separación explícita: `PAYMENT_SUCCEEDED` ≠ `ACTIVE` (activación en fase posterior).
 */
export type ConfirmSimulatedPaymentResponse =
  | {
      ok: true
      intentPublicId: string
      intentStatus: "PAYMENT_SUCCEEDED"
    }
  | {
      ok: false
      reason:
        | "intent_not_found"
        | "intent_expired"
        | "invalid_intent_state"
        | "payment_declined"
        | "payment_provider_error"
      /** Presente cuando el intento se actualizó a `PAYMENT_FAILED`. */
      intentPublicId?: string
      intentStatus?: "PAYMENT_FAILED"
    }
