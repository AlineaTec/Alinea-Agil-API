import type { PlatformRole } from "../../domain/platform-role.js"
import type { PlatformUserStatus } from "../../domain/platform-user-status.js"
import type { MfaStatus } from "../../domain/mfa-status.js"

export interface PlatformUserDocProps {
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
}
