/**
 * POST /verification/request — emisión (no confirmación) del código.
 * Forma estable para `web` (OpenAPI pendiente).
 *
 * `email_delivery_failed`: falló el envío (p. ej. Resend); el desafío creado pasa a EXPIRED para permitir reemisión.
 */
export type VerificationRequestResponse =
  | { sent: true; devCode?: string }
  | {
      sent: false
      reason:
        | "intent_not_found"
        | "invalid_intent_state"
        | "intent_expired"
        | "email_delivery_failed"
    }
