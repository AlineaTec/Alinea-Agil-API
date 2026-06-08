import type { IdentityVerificationChallengeStatus } from "./identity-verification-challenge-status.js"

/**
 * Registro del desafío OTP / verificación (Fase B).
 * El código en reposo no debe ser recuperable (p. ej. solo hash).
 *
 * TODO [P]: política de intentos, TTL, invalidación al reemitir.
 */
export interface IdentityVerificationChallenge {
  challengePublicId: string
  registrationIntentPublicId: string
  emailNormalized: string
  codeHash: string
  status: IdentityVerificationChallengeStatus
  expiresAt: Date
  /** Intentos fallidos al verificar (Fase B confirmar código) — hoy solo inicializado en 0. */
  attemptCount: number
  /** Tope de intentos fallidos permitidos para este desafío (próxima operación). */
  maxAttempts: number
  createdAt: Date
  updatedAt: Date
}
