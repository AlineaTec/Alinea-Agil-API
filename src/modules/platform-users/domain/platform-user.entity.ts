import type { MfaStatus } from "./mfa-status.js"
import type { PlatformRole } from "./platform-role.js"
import type { PlatformUserStatus } from "./platform-user-status.js"

/**
 * Usuario de **plataforma** (`/admin`): independiente de memberships del workspace cliente.
 * @see contracts-docs admin-platform-users, admin-core
 */
export type PlatformUserState = {
  platformUserId: string
  email: string
  displayName: string | null
  role: PlatformRole
  status: PlatformUserStatus
  mfaStatus: MfaStatus
  mfaTotpSecretBase32: string | null
  mfaFailedAttempts: number
  mfaLockedUntil: Date | null
  invitationNonceHash: string | null
  passwordSalt: string | null
  passwordHash: string | null
  createdAt: Date
  updatedAt: Date
}

export type PlatformUserPublic = Omit<
  PlatformUserState,
  "mfaTotpSecretBase32" | "invitationNonceHash" | "passwordSalt" | "passwordHash"
>
