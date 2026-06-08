/**
 * Ciclo de vida del desafío de verificación (Fase B).
 * Detalle de transiciones: contracts-docs + implementación futura.
 */
export const VERIFICATION_CHALLENGE_STATUSES = [
  "PENDING",
  "CONSUMED",
  "EXPIRED",
  "SUPERSEDED",
] as const

export type IdentityVerificationChallengeStatus =
  (typeof VERIFICATION_CHALLENGE_STATUSES)[number]
