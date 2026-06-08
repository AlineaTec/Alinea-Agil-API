/**
 * Resultado POST /verification/confirm (OP-B3, REG-VERIFY-03…08).
 * Contrato explícito para enlazar con `web`.
 */

export type VerificationConfirmFailureReason =
  | "intent_not_found"
  | "invalid_intent_state"
  | "intent_expired"
  /** No hay challenge PENDING vigente (p. ej. nunca se pidió código o hubo reemisión y este cliente usa uno viejo). */
  | "challenge_not_found"
  | "challenge_expired"
  | "code_incorrect"
  /** Tras este resultado el challenge queda EXPIRED; hay que solicitar nuevo código. */
  | "max_attempts_reached"

export type VerificationConfirmResponse =
  | {
      verified: true
      intentPublicId: string
      /** Estado del dominio tras éxito: correo verificado, listo para Fase C en backend. */
      intentStatus: "EMAIL_VERIFIED"
    }
  | {
      verified: false
      reason: VerificationConfirmFailureReason
      /** Solo cuando `reason === "code_incorrect"`; intentos restantes antes de bloqueo. */
      attemptsRemaining?: number
    }
