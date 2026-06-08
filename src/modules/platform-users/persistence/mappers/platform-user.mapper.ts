import type { PlatformUserDocProps } from "../schemas/platform-user.schema.js"
import type { PlatformUserState } from "../../domain/platform-user.entity.js"

/** Fila Prisma / estado de dominio con timestamps. */
export type PlatformUserLeanDoc = PlatformUserDocProps & {
  createdAt: Date
  updatedAt: Date
}

export function platformUserDocToState(doc: PlatformUserLeanDoc): PlatformUserState {
  return {
    platformUserId: doc.platformUserId,
    email: doc.email,
    displayName: doc.displayName,
    role: doc.role,
    status: doc.status,
    mfaStatus: doc.mfaStatus,
    mfaTotpSecretBase32: doc.mfaTotpSecretBase32,
    mfaFailedAttempts: doc.mfaFailedAttempts,
    mfaLockedUntil: doc.mfaLockedUntil,
    invitationNonceHash: doc.invitationNonceHash,
    passwordSalt: doc.passwordSalt,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
