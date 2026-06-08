/**
 * Respuesta POST `/account-credentials` (Fase E, OP-E1 orientativo).
 * Contrato explícito para futura integración `web`.
 */
export type SetAccountCredentialsResponse =
  | {
      ok: true
      intentPublicId: string
      intentStatus: "CREDENTIALS_SET"
      /** Nombre completo persistido (normalizado). */
      fullName: string
    }
  | {
      ok: false
      reason:
        | "intent_not_found"
        | "invalid_intent_state"
        | "intent_expired"
        | "invalid_full_name"
        | "invalid_password"
    }
