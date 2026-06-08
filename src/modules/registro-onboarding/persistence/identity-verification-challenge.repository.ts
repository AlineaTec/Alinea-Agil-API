import type { IdentityVerificationChallengeStatus } from "../domain/identity-verification-challenge-status.js"
import type { IdentityVerificationChallenge } from "../domain/identity-verification-challenge.entity.js"

/** Parcial permitido para actualizar un challenge existente. */
export interface UpdateIdentityVerificationChallengePatch {
  status?: IdentityVerificationChallengeStatus
  attemptCount?: number
}

/** Entrada para crear un desafío pendiente tras emisión de código. */
export interface CreateIdentityVerificationChallengeInput {
  challengePublicId: string
  registrationIntentPublicId: string
  emailNormalized: string
  codeHash: string
  expiresAt: Date
  maxAttempts: number
}

/**
 * Puerto de persistencia del desafío de verificación (Fase B).
 */
export interface IdentityVerificationChallengeRepository {
  create(input: CreateIdentityVerificationChallengeInput): Promise<IdentityVerificationChallenge>

  /**
   * Invalida desafíos anteriores en PENDING para el mismo intento (reemisión).
   * @returns cantidad de documentos actualizados.
   */
  supersedePendingForIntent(
    registrationIntentPublicId: string,
  ): Promise<number>

  findByChallengePublicId(id: string): Promise<IdentityVerificationChallenge | null>

  /**
   * Último desafío **PENDING** del intento (el vigente tras `/verification/request`).
   */
  findLatestPendingChallengeForIntent(
    registrationIntentPublicId: string,
  ): Promise<IdentityVerificationChallenge | null>

  updateByChallengePublicId(
    challengePublicId: string,
    patch: UpdateIdentityVerificationChallengePatch,
  ): Promise<IdentityVerificationChallenge | null>
}
