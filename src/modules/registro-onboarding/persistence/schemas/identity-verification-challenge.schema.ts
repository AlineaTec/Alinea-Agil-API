import type { IdentityVerificationChallengeStatus } from "../../domain/identity-verification-challenge-status.js"

/** Registro persistido — desafío de verificación (Fase B). Implementación de lógica: pendiente.  */
export interface IdentityVerificationChallengeDocProps {
  challengePublicId: string
  registrationIntentPublicId: string
  emailNormalized: string
  codeHash: string
  status: IdentityVerificationChallengeStatus
  expiresAt: Date
  attemptCount: number
  maxAttempts: number
}
