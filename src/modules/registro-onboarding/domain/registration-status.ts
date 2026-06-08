/**
 * Estados tentativos del intento de registro.
 * Fuente: contracts-docs/.../api-needs.md — «Estados del proceso que api debería modelar».
 * Ajustar nombres al formalizar OpenAPI si hace falta.
 */
export const REGISTRATION_INTENT_STATUSES = [
  "EMAIL_COLLECTED",
  "EMAIL_VERIFIED",
  "MODALITY_SELECTED",
  "WORKSPACE_PROPOSED",
  "CREDENTIALS_SET",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCEEDED",
  "PROVISIONING",
  "ACTIVE",
  "EXPIRED",
  "ABANDONED",
] as const

export type IdentityRegistrationIntentStatus =
  (typeof REGISTRATION_INTENT_STATUSES)[number]
